import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface SyncedProcedureDeadline {
  id: string;
  title: string;
  effectiveDeadlineDate: string; // YYYY-MM-DD
  deadlineKind: 'legal' | 'recommended' | 'none';
  priorityBucket: 'first' | 'months' | 'later';
  whereToDoIt: string;
  requiredDocs: string[];
  done: boolean;
}

export interface SyncedCaseReminderSchedule {
  caseId: string;
  ownerUid: string;
  memberUids: string[];
  deceasedName: string;
  ccaa: string;
  recipientEmail: string;
  recipientName: string;
  enabled: boolean;
  daysBefore: number;
  onlyLegalDeadlines: boolean;
  appOrigin: string;
  procedures: SyncedProcedureDeadline[];
  syncedAt: string;
}

export interface ReminderDispatchRecord {
  id: string;
  caseId: string;
  recipientEmail: string;
  triggerType: 'auto' | 'manual_summary' | 'test';
  status: 'sent' | 'simulated_no_api_key' | 'error';
  resendId?: string;
  errorMessage?: string;
  subject: string;
  procedureIds: string[];
  procedureTitles: string[];
  htmlPreview: string;
  textPreview: string;
  createdAt: string;
}

interface RemindersStoreData {
  schedules: Record<string, SyncedCaseReminderSchedule>;
  sentDedupeKeys: Record<string, string>;
  simulatedDedupeKeys: Record<string, string>;
  history: ReminderDispatchRecord[];
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const STORE_PATH = path.join(DATA_DIR, 'reminders-store.json');
const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const VALID_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

let storeCache: RemindersStoreData | null = null;
let schedulerHandle: ReturnType<typeof setInterval> | null = null;

function defaultStore(): RemindersStoreData {
  return {
    schedules: {},
    sentDedupeKeys: {},
    simulatedDedupeKeys: {},
    history: [],
  };
}

function loadStore(): RemindersStoreData {
  if (storeCache) return storeCache;
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<RemindersStoreData>;
      storeCache = {
        schedules: parsed.schedules || {},
        sentDedupeKeys: parsed.sentDedupeKeys || {},
        simulatedDedupeKeys: parsed.simulatedDedupeKeys || {},
        history: Array.isArray(parsed.history) ? parsed.history.slice(0, 500) : [],
      };
      return storeCache;
    }
  } catch (err) {
    console.warn('No se pudo leer el almacén de recordatorios, iniciando limpio:', err);
  }
  storeCache = defaultStore();
  return storeCache;
}

function saveStore(data: RemindersStoreData): void {
  storeCache = data;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpPath = `${STORE_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpPath, STORE_PATH);
  } catch (err) {
    console.error('Error guardando almacén de recordatorios:', err);
  }
}

export function isValidEmail(email: string): boolean {
  return typeof email === 'string' && email.length <= 200 && EMAIL_REGEX.test(email.trim());
}

export function isValidCaseId(caseId: string): boolean {
  return typeof caseId === 'string' && VALID_ID_REGEX.test(caseId);
}

export function escapeHtml(input: string): string {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeOrigin(origin?: string): string {
  const fallback = process.env.APP_URL && /^https?:\/\//i.test(process.env.APP_URL)
    ? process.env.APP_URL.replace(/\/+$/, '')
    : 'http://localhost:3000';
  if (!origin || typeof origin !== 'string') return fallback;
  const trimmed = origin.trim().replace(/\/+$/, '');
  return /^https?:\/\/[a-zA-Z0-9.-]+(:\d+)?(\/.*)?$/i.test(trimmed) ? trimmed : fallback;
}

export function getMadridTodayISO(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value || '2026';
  const m = parts.find((p) => p.type === 'month')?.value || '01';
  const d = parts.find((p) => p.type === 'day')?.value || '01';
  return `${y}-${m}-${d}`;
}

function parseISODateUTC(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  return Date.UTC(y, m - 1, d);
}

export function daysUntilMadridDate(deadlineISO: string): number | null {
  const targetMs = parseISODateUTC(deadlineISO);
  const todayMs = parseISODateUTC(getMadridTodayISO());
  if (targetMs === null || todayMs === null) return null;
  return Math.round((targetMs - todayMs) / (1000 * 60 * 60 * 24));
}

export function subtractDaysISO(deadlineISO: string, days: number): string | null {
  const targetMs = parseISODateUTC(deadlineISO);
  if (targetMs === null) return null;
  const d = new Date(targetMs - days * 24 * 60 * 60 * 1000);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function formatDateSpanishLong(iso: string): string {
  const ms = parseISODateUTC(iso);
  if (ms === null) return iso;
  return new Date(ms).toLocaleDateString('es-ES', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatDaysLabel(daysUntil: number | null): string {
  if (daysUntil === null) return 'Sin fecha fija';
  if (daysUntil === 0) return 'Vence hoy';
  if (daysUntil === 1) return 'Vence mañana';
  if (daysUntil > 1) return `Faltan ${daysUntil} días`;
  const past = Math.abs(daysUntil);
  return past === 1 ? 'Fecha cumplida ayer' : `Fecha cumplida hace ${past} días`;
}

export function getResendFromAddress(): string {
  const custom = (process.env.RESEND_FROM_EMAIL || '').trim();
  return custom || 'Después del adiós <onboarding@resend.dev>';
}

export function isResendConfigured(): boolean {
  return Boolean((process.env.RESEND_API_KEY || '').trim());
}

interface BuiltEmailContent {
  subject: string;
  html: string;
  text: string;
}

export function buildWarmReminderEmail(params: {
  deceasedName: string;
  ccaa: string;
  recipientName: string;
  appOrigin: string;
  triggerType: 'auto' | 'manual_summary' | 'test';
  procedures: Array<SyncedProcedureDeadline & { daysUntil: number | null }>;
}): BuiltEmailContent {
  const { deceasedName, ccaa, recipientName, appOrigin, triggerType, procedures } = params;
  const safeName = escapeHtml(deceasedName);
  const safeCcaa = escapeHtml(ccaa);
  const safeRecipient = recipientName ? escapeHtml(recipientName) : '';
  const safeUrl = escapeHtml(sanitizeOrigin(appOrigin));

  const greetingName = safeRecipient ? `Hola, ${safeRecipient}:` : 'Hola:';
  const greetingText = recipientName ? `Hola, ${recipientName}:` : 'Hola:';

  let subject = `Recordatorio de plazos — ${deceasedName}`;
  if (triggerType === 'auto') {
    if (procedures.length === 1) {
      const p = procedures[0];
      const urgent = p.daysUntil !== null && p.daysUntil <= 1;
      subject = urgent
        ? `Plazo muy próximo: ${p.title} (${deceasedName})`
        : `Recordatorio cercano: ${p.title} — ${deceasedName}`;
    } else {
      subject = `${procedures.length} plazos próximos en el caso de ${deceasedName}`;
    }
  } else if (triggerType === 'test') {
    subject = `Correo de prueba y resumen de plazos — ${deceasedName}`;
  }
  subject = subject.slice(0, 190);

  const introHtml =
    triggerType === 'auto'
      ? `Sabemos que estos días pueden resultar difíciles y que es muy fácil perder la cuenta de las fechas. Te escribimos con calma para recordarte ${
          procedures.length === 1
            ? 'un trámite importante cuyo plazo se acerca'
            : `<strong>${procedures.length} trámites importantes</strong> con fechas cercanas`
        } para el caso de <strong>${safeName}</strong> (${safeCcaa}).`
      : triggerType === 'test'
      ? `Este es un correo de comprobación de tus avisos automáticos en <strong>Después del adiós</strong>. A partir de ahora, recibirás un mensaje como este antes de cada vencimiento importante del caso de <strong>${safeName}</strong> (${safeCcaa}).`
      : `Aquí tienes un resumen actualizado y ordenado de los próximos plazos pendientes en el caso de <strong>${safeName}</strong> (${safeCcaa}), para que podáis organizaros paso a paso y sin agobios.`;

  const introText =
    triggerType === 'auto'
      ? `Sabemos que estos días pueden resultar difíciles y que es muy fácil perder la cuenta de las fechas. Te escribimos con calma para recordarte ${
          procedures.length === 1
            ? 'un trámite importante cuyo plazo se acerca'
            : `${procedures.length} trámites importantes con fechas cercanas`
        } para el caso de ${deceasedName} (${ccaa}).`
      : triggerType === 'test'
      ? `Este es un correo de comprobación de tus avisos automáticos en Después del adiós. Recibirás un mensaje como este antes de cada vencimiento importante del caso de ${deceasedName} (${ccaa}).`
      : `Aquí tienes un resumen actualizado y ordenado de los próximos plazos pendientes en el caso de ${deceasedName} (${ccaa}), para que podáis organizaros paso a paso y sin agobios.`;

  const cardsHtml =
    procedures.length === 0
      ? `<div style="background:#FAF8F5;border:1px solid #E7E2D8;border-radius:12px;padding:18px;margin-top:18px;color:#45484F;font-size:15px;line-height:1.6;">
           No hay trámites pendientes con fecha próxima en este momento. Cuando añadas nuevos pasos o fechas, te avisaremos con la antelación elegida.
         </div>`
      : procedures
          .map((proc) => {
            const formattedDate = formatDateSpanishLong(proc.effectiveDeadlineDate);
            const daysLabel = formatDaysLabel(proc.daysUntil);
            const kindLabel =
              proc.deadlineKind === 'legal' ? 'Plazo legal' : 'Fecha orientativa';
            const isSoon = proc.daysUntil !== null && proc.daysUntil <= 3;
            const docs = proc.requiredDocs.slice(0, 4);

            return `
              <div style="background:#FAF8F5;border:1px solid ${isSoon ? '#D4A857' : '#E7E2D8'};border-radius:14px;padding:18px 20px;margin-top:14px;">
                <p style="margin:0;font-size:12px;font-weight:600;color:${isSoon ? '#8A5300' : '#7D633A'};letter-spacing:0.01em;">
                  ${escapeHtml(daysLabel)} · ${escapeHtml(formattedDate)} · ${escapeHtml(kindLabel)}
                </p>
                <h3 style="margin:6px 0 8px 0;font-size:17px;line-height:1.35;color:#141518;font-family:Georgia,'Times New Roman',serif;">
                  ${escapeHtml(proc.title)}
                </h3>
                ${
                  proc.whereToDoIt
                    ? `<p style="margin:0 0 8px 0;font-size:14px;line-height:1.55;color:#45484F;">
                         <strong style="color:#1C1E22;">Dónde se hace:</strong> ${escapeHtml(proc.whereToDoIt)}
                       </p>`
                    : ''
                }
                ${
                  docs.length > 0
                    ? `<p style="margin:0;font-size:13px;line-height:1.55;color:#5B5E65;">
                         <strong style="color:#1C1E22;">Documentos habituales:</strong> ${docs.map(escapeHtml).join(' · ')}
                       </p>`
                    : ''
                }
              </div>
            `;
          })
          .join('');

  const itemsText =
    procedures.length === 0
      ? 'No hay trámites pendientes con fecha próxima en este momento.'
      : procedures
          .map((proc, index) => {
            const formattedDate = formatDateSpanishLong(proc.effectiveDeadlineDate);
            const daysLabel = formatDaysLabel(proc.daysUntil);
            const kindLabel =
              proc.deadlineKind === 'legal' ? 'Plazo legal' : 'Fecha orientativa';
            const docs = proc.requiredDocs.slice(0, 4).join(', ');
            return (
              `${index + 1}. ${proc.title}\n` +
              `   Fecha límite: ${formattedDate} (${daysLabel} · ${kindLabel})\n` +
              (proc.whereToDoIt ? `   Dónde se hace: ${proc.whereToDoIt}\n` : '') +
              (docs ? `   Documentos habituales: ${docs}\n` : '')
            );
          })
          .join('\n');

  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#F3EFE7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1C1E22;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#F3EFE7;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background-color:#FFFFFF;border:1px solid #E7E2D8;border-radius:18px;overflow:hidden;">
            <tr>
              <td style="background-color:#141518;padding:26px 28px;">
                <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:24px;color:#F6F4EF;font-weight:600;">
                  Después del adiós
                </p>
                <p style="margin:6px 0 0 0;font-size:13px;color:#D6C3A5;">
                  Organización tranquila de trámites tras un fallecimiento
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <p style="margin:0 0 12px 0;font-size:16px;font-weight:600;color:#141518;">
                  ${greetingName}
                </p>
                <p style="margin:0;font-size:15px;line-height:1.65;color:#3A3D44;">
                  ${introHtml}
                </p>

                ${cardsHtml}

                <div style="margin-top:26px;text-align:center;">
                  <a href="${safeUrl}" style="display:inline-block;background-color:#141518;color:#F6F4EF;text-decoration:none;font-size:14px;font-weight:600;padding:13px 24px;border-radius:12px;">
                    Abrir caso en Después del adiós
                  </a>
                </div>

                <p style="margin:22px 0 0 0;font-size:13px;line-height:1.6;color:#666A73;">
                  Si ya habéis realizado alguno de estos trámites, podéis marcarlo como hecho dentro del caso para no recibir más avisos sobre él, o cambiar la antelación desde «Ayuda y escritos → Avisos por correo».
                </p>
              </td>
            </tr>
            <tr>
              <td style="background-color:#FAF8F5;border-top:1px solid #E7E2D8;padding:18px 28px;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:#5B5E65;">
                  <strong>Aviso importante:</strong> «Después del adiós» es una herramienta de organización e información práctica. Este mensaje no constituye asesoramiento jurídico, fiscal ni notarial.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text =
    `${greetingText}\n\n` +
    `${introText}\n\n` +
    `${itemsText}\n\n` +
    `Abrir el caso: ${sanitizeOrigin(appOrigin)}\n\n` +
    `Si ya habéis completado alguno de estos trámites, podéis marcarlo como hecho en la aplicación para dejar de recibir avisos sobre él.\n\n` +
    `Aviso importante: «Después del adiós» es una herramienta de organización e información práctica. Este mensaje no constituye asesoramiento jurídico, fiscal ni notarial.`;

  return { subject, html, text };
}

export function buildWarmGeneralEmail(params: {
  subject: string;
  bodyText: string;
  kind?: 'invite' | 'reminder' | 'legal_alert';
  appOrigin?: string;
}): BuiltEmailContent {
  const { subject, bodyText, kind = 'reminder', appOrigin } = params;
  const safeSubject = escapeHtml(subject.slice(0, 190));
  const paragraphs = String(bodyText || '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.65;color:#3A3D44;">${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`
    )
    .join('');

  const subtitle =
    kind === 'invite'
      ? 'Invitación familiar para organizaros juntos'
      : kind === 'legal_alert'
      ? 'Aviso de actualización normativa'
      : 'Organización tranquila de trámites tras un fallecimiento';

  const safeUrl = escapeHtml(sanitizeOrigin(appOrigin));

  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeSubject}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#F3EFE7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1C1E22;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#F3EFE7;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background-color:#FFFFFF;border:1px solid #E7E2D8;border-radius:18px;overflow:hidden;">
            <tr>
              <td style="background-color:#141518;padding:24px 28px;">
                <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#F6F4EF;font-weight:600;">
                  Después del adiós
                </p>
                <p style="margin:6px 0 0 0;font-size:13px;color:#D6C3A5;">
                  ${escapeHtml(subtitle)}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 28px;">
                ${paragraphs}
                <div style="margin-top:22px;">
                  <a href="${safeUrl}" style="display:inline-block;background-color:#141518;color:#F6F4EF;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:12px;">
                    Ir a Después del adiós
                  </a>
                </div>
              </td>
            </tr>
            <tr>
              <td style="background-color:#FAF8F5;border-top:1px solid #E7E2D8;padding:16px 28px;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:#5B5E65;">
                  «Después del adiós» es una herramienta de organización e información práctica. No ofrece asesoramiento jurídico, fiscal ni notarial.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const disclaimerSuffix =
    '«Después del adiós» es una herramienta de organización e información práctica. No ofrece asesoramiento jurídico.';
  const text = bodyText.includes('asesoramiento jurídico')
    ? bodyText
    : `${bodyText}\n\n${disclaimerSuffix}`;

  return { subject: subject.slice(0, 190), html, text };
}

export async function dispatchViaResend(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
  tags?: Array<{ name: string; value: string }>;
}): Promise<{
  status: 'sent' | 'simulated_no_api_key' | 'error';
  resendId?: string;
  errorMessage?: string;
}> {
  const resendKey = (process.env.RESEND_API_KEY || '').trim();
  if (!resendKey) {
    return { status: 'simulated_no_api_key' };
  }

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: getResendFromAddress(),
        to: [params.to.trim()],
        subject: params.subject,
        html: params.html,
        text: params.text,
        tags: params.tags,
      }),
    });

    const data = (await resp.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      name?: string;
    };

    if (!resp.ok) {
      const detail = data?.message || data?.name || `HTTP ${resp.status}`;
      return {
        status: 'error',
        errorMessage: `Resend devolvió un error (${resp.status}): ${detail}`.slice(0, 380),
      };
    }

    return {
      status: 'sent',
      resendId: data.id ? String(data.id).slice(0, 120) : undefined,
    };
  } catch (err) {
    return {
      status: 'error',
      errorMessage:
        err instanceof Error
          ? `No se pudo conectar con Resend: ${err.message}`.slice(0, 380)
          : 'Error de red al conectar con Resend.',
    };
  }
}

export function upsertCaseSchedule(
  callerUid: string,
  input: {
    caseId: string;
    ownerUid: string;
    memberUids: string[];
    deceasedName: string;
    ccaa: string;
    recipientEmail: string;
    recipientName?: string;
    enabled: boolean;
    daysBefore: number;
    onlyLegalDeadlines?: boolean;
    appOrigin?: string;
    procedures: SyncedProcedureDeadline[];
  }
): { ok: true; schedule: SyncedCaseReminderSchedule } | { ok: false; status: number; error: string } {
  if (!isValidCaseId(input.caseId)) {
    return { ok: false, status: 400, error: 'Identificador de caso no válido.' };
  }
  const store = loadStore();
  const existing = store.schedules[input.caseId];
  if (
    existing &&
    existing.ownerUid !== callerUid &&
    !existing.memberUids.includes(callerUid)
  ) {
    return { ok: false, status: 403, error: 'No tienes permiso para modificar los avisos de este caso.' };
  }

  const cleanMemberUids = Array.from(
    new Set(
      [callerUid, input.ownerUid, ...(input.memberUids || [])].filter((u) =>
        VALID_ID_REGEX.test(u)
      )
    )
  ).slice(0, 15);

  const clampedDays = Math.min(60, Math.max(1, Math.round(Number(input.daysBefore) || 7)));
  const cleanProcs: SyncedProcedureDeadline[] = (input.procedures || [])
    .filter((p) => p && typeof p.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.effectiveDeadlineDate))
    .slice(0, 40)
    .map((p) => ({
      id: String(p.id).slice(0, 120),
      title: String(p.title || '').slice(0, 180),
      effectiveDeadlineDate: p.effectiveDeadlineDate,
      deadlineKind:
        p.deadlineKind === 'legal' || p.deadlineKind === 'recommended'
          ? p.deadlineKind
          : 'none',
      priorityBucket:
        p.priorityBucket === 'first' || p.priorityBucket === 'later'
          ? p.priorityBucket
          : 'months',
      whereToDoIt: String(p.whereToDoIt || '').slice(0, 500),
      requiredDocs: Array.isArray(p.requiredDocs)
        ? p.requiredDocs.slice(0, 10).map((d) => String(d).slice(0, 120))
        : [],
      done: Boolean(p.done),
    }));

  const schedule: SyncedCaseReminderSchedule = {
    caseId: input.caseId,
    ownerUid: existing ? existing.ownerUid : (VALID_ID_REGEX.test(input.ownerUid) ? input.ownerUid : callerUid),
    memberUids: cleanMemberUids,
    deceasedName: String(input.deceasedName || 'Tu familiar').slice(0, 120),
    ccaa: String(input.ccaa || 'España').slice(0, 80),
    recipientEmail: String(input.recipientEmail || '').trim().slice(0, 200),
    recipientName: String(input.recipientName || '').trim().slice(0, 120),
    enabled: Boolean(input.enabled),
    daysBefore: clampedDays,
    onlyLegalDeadlines: Boolean(input.onlyLegalDeadlines),
    appOrigin: sanitizeOrigin(input.appOrigin),
    procedures: cleanProcs,
    syncedAt: new Date().toISOString(),
  };

  store.schedules[input.caseId] = schedule;
  saveStore(store);
  return { ok: true, schedule };
}

export function deleteCaseSchedule(
  callerUid: string,
  caseId: string
): { ok: true } | { ok: false; status: number; error: string } {
  if (!isValidCaseId(caseId)) {
    return { ok: false, status: 400, error: 'Identificador de caso no válido.' };
  }
  const store = loadStore();
  const existing = store.schedules[caseId];
  if (!existing) {
    return { ok: true };
  }
  if (existing.ownerUid !== callerUid && !existing.memberUids.includes(callerUid)) {
    return { ok: false, status: 403, error: 'No tienes permiso para eliminar los avisos de este caso.' };
  }
  delete store.schedules[caseId];
  saveStore(store);
  return { ok: true };
}

function getDueProceduresForSchedule(schedule: SyncedCaseReminderSchedule) {
  const candidates = schedule.procedures
    .filter((p) => {
      if (p.done) return false;
      if (schedule.onlyLegalDeadlines && p.deadlineKind !== 'legal') return false;
      return true;
    })
    .map((p) => {
      const daysUntil = daysUntilMadridDate(p.effectiveDeadlineDate);
      return { ...p, daysUntil };
    })
    .filter(
      (p): p is SyncedProcedureDeadline & { daysUntil: number } =>
        p.daysUntil !== null && p.daysUntil <= schedule.daysBefore && p.daysUntil >= -2
    )
    .sort((a, b) => a.daysUntil - b.daysUntil);

  return candidates.map((p) => {
    const bucket = p.daysUntil <= 1 ? 'final' : 'advance';
    const dedupeKey = `${schedule.caseId}::${p.id}::${p.effectiveDeadlineDate}::${bucket}`;
    return { proc: p, bucket, dedupeKey };
  });
}

export async function evaluateCaseRemindersNow(
  caseId: string
): Promise<ReminderDispatchRecord | null> {
  const store = loadStore();
  const schedule = store.schedules[caseId];
  if (!schedule || !schedule.enabled || !isValidEmail(schedule.recipientEmail)) {
    return null;
  }

  const dueItems = getDueProceduresForSchedule(schedule);
  const resendConfigured = isResendConfigured();
  const pendingToSend = dueItems.filter((item) => {
    if (store.sentDedupeKeys[item.dedupeKey]) return false;
    if (!resendConfigured && store.simulatedDedupeKeys[item.dedupeKey]) return false;
    return true;
  });

  if (pendingToSend.length === 0) {
    return null;
  }

  const procsForEmail = pendingToSend.map((item) => item.proc);
  const built = buildWarmReminderEmail({
    deceasedName: schedule.deceasedName,
    ccaa: schedule.ccaa,
    recipientName: schedule.recipientName,
    appOrigin: schedule.appOrigin,
    triggerType: 'auto',
    procedures: procsForEmail,
  });

  const result = await dispatchViaResend({
    to: schedule.recipientEmail,
    subject: built.subject,
    html: built.html,
    text: built.text,
    tags: [
      { name: 'app', value: 'despues-del-adios' },
      { name: 'trigger', value: 'auto_deadline' },
      { name: 'case_id', value: schedule.caseId.replace(/[^a-zA-Z0-9_-]/g, '_') },
    ],
  });

  const now = new Date().toISOString();
  const record: ReminderDispatchRecord = {
    id: `rem_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
    caseId: schedule.caseId,
    recipientEmail: schedule.recipientEmail,
    triggerType: 'auto',
    status: result.status,
    resendId: result.resendId,
    errorMessage: result.errorMessage,
    subject: built.subject,
    procedureIds: procsForEmail.map((p) => p.id),
    procedureTitles: procsForEmail.map((p) => p.title),
    htmlPreview: built.html,
    textPreview: built.text,
    createdAt: now,
  };

  if (result.status === 'sent') {
    for (const item of pendingToSend) {
      store.sentDedupeKeys[item.dedupeKey] = now;
    }
  } else if (result.status === 'simulated_no_api_key') {
    for (const item of pendingToSend) {
      store.simulatedDedupeKeys[item.dedupeKey] = now;
    }
  }

  store.history = [record, ...store.history].slice(0, 500);
  saveStore(store);
  return record;
}

export async function runManualOrTestReminder(params: {
  caseId: string;
  callerUid: string;
  mode: 'manual_summary' | 'test';
  overrideEmail?: string;
}): Promise<
  | { ok: true; record: ReminderDispatchRecord; mailtoHref: string }
  | { ok: false; status: number; error: string }
> {
  const store = loadStore();
  const schedule = store.schedules[params.caseId];
  if (!schedule) {
    return {
      ok: false,
      status: 404,
      error: 'Primero guarda o abre el caso para sincronizar sus plazos.',
    };
  }
  if (schedule.ownerUid !== params.callerUid && !schedule.memberUids.includes(params.callerUid)) {
    return { ok: false, status: 403, error: 'No tienes permiso sobre este caso.' };
  }

  const targetEmail = (params.overrideEmail || schedule.recipientEmail || '').trim();
  if (!isValidEmail(targetEmail)) {
    return { ok: false, status: 400, error: 'Introduce una dirección de correo electrónico válida.' };
  }

  const upcoming = schedule.procedures
    .filter((p) => !p.done && (!schedule.onlyLegalDeadlines || p.deadlineKind === 'legal'))
    .map((p) => ({ ...p, daysUntil: daysUntilMadridDate(p.effectiveDeadlineDate) }))
    .filter((p) => p.daysUntil !== null && p.daysUntil >= -7)
    .sort((a, b) => (a.daysUntil ?? 9999) - (b.daysUntil ?? 9999))
    .slice(0, 6);

  const built = buildWarmReminderEmail({
    deceasedName: schedule.deceasedName,
    ccaa: schedule.ccaa,
    recipientName: schedule.recipientName,
    appOrigin: schedule.appOrigin,
    triggerType: params.mode,
    procedures: upcoming,
  });

  const result = await dispatchViaResend({
    to: targetEmail,
    subject: built.subject,
    html: built.html,
    text: built.text,
    tags: [
      { name: 'app', value: 'despues-del-adios' },
      { name: 'trigger', value: params.mode },
      { name: 'case_id', value: schedule.caseId.replace(/[^a-zA-Z0-9_-]/g, '_') },
    ],
  });

  const now = new Date().toISOString();
  const record: ReminderDispatchRecord = {
    id: `rem_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
    caseId: schedule.caseId,
    recipientEmail: targetEmail,
    triggerType: params.mode,
    status: result.status,
    resendId: result.resendId,
    errorMessage: result.errorMessage,
    subject: built.subject,
    procedureIds: upcoming.map((p) => p.id),
    procedureTitles: upcoming.map((p) => p.title),
    htmlPreview: built.html,
    textPreview: built.text,
    createdAt: now,
  };

  store.history = [record, ...store.history].slice(0, 500);
  saveStore(store);

  const mailtoHref = `mailto:${encodeURIComponent(targetEmail)}?subject=${encodeURIComponent(
    built.subject
  )}&body=${encodeURIComponent(built.text)}`;

  return { ok: true, record, mailtoHref };
}

export function getCaseReminderStatus(callerUid: string, caseId: string) {
  if (!isValidCaseId(caseId)) {
    return { ok: false as const, status: 400, error: 'Identificador de caso no válido.' };
  }
  const store = loadStore();
  const schedule = store.schedules[caseId] || null;
  if (
    schedule &&
    schedule.ownerUid !== callerUid &&
    !schedule.memberUids.includes(callerUid)
  ) {
    return { ok: false as const, status: 403, error: 'No tienes permiso sobre este caso.' };
  }

  const history = store.history
    .filter((h) => h.caseId === caseId)
    .slice(0, 25);

  const upcomingTriggers = schedule
    ? schedule.procedures
        .filter((p) => !p.done && (!schedule.onlyLegalDeadlines || p.deadlineKind === 'legal'))
        .map((p) => {
          const daysUntil = daysUntilMadridDate(p.effectiveDeadlineDate);
          const triggerDate = subtractDaysISO(p.effectiveDeadlineDate, schedule.daysBefore);
          const advanceKey = `${caseId}::${p.id}::${p.effectiveDeadlineDate}::advance`;
          const finalKey = `${caseId}::${p.id}::${p.effectiveDeadlineDate}::final`;
          return {
            procedureId: p.id,
            title: p.title,
            effectiveDeadlineDate: p.effectiveDeadlineDate,
            deadlineKind: p.deadlineKind,
            daysUntil,
            plannedNoticeDate: triggerDate,
            advanceSentAt: store.sentDedupeKeys[advanceKey] || null,
            finalSentAt: store.sentDedupeKeys[finalKey] || null,
          };
        })
        .filter((item) => item.daysUntil !== null && item.daysUntil >= -2)
        .sort((a, b) => (a.daysUntil ?? 9999) - (b.daysUntil ?? 9999))
    : [];

  return {
    ok: true as const,
    resendConfigured: isResendConfigured(),
    fromAddress: getResendFromAddress(),
    schedule,
    upcomingTriggers,
    history,
  };
}

export async function runAllScheduledRemindersSweep(): Promise<number> {
  const store = loadStore();
  const caseIds = Object.keys(store.schedules);
  let dispatchedCount = 0;
  for (const caseId of caseIds) {
    try {
      const rec = await evaluateCaseRemindersNow(caseId);
      if (rec) dispatchedCount += 1;
    } catch (err) {
      console.error(`Error evaluando recordatorios del caso ${caseId}:`, err);
    }
  }
  return dispatchedCount;
}

export function startAutomatedReminderScheduler(): void {
  if (schedulerHandle) return;
  // Initial check shortly after server boot
  setTimeout(() => {
    void runAllScheduledRemindersSweep();
  }, 15_000);
  // Periodic sweep every 15 minutes
  schedulerHandle = setInterval(() => {
    void runAllScheduledRemindersSweep();
  }, 15 * 60 * 1000);
}
