import type { BereavementCase, PersonalizedProcedure } from '../types/domain';
import { formatDateES, parseISODate } from './caseEngine';

export interface ExportICSOptions {
  includeCompleted?: boolean;
}

export interface ExportICSResult {
  exportedCount: number;
  skippedNoDateCount: number;
  filename: string;
  icsContent: string;
}

function escapeIcsText(value: string): string {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

/**
 * RFC 5545 §3.1: Content lines must not exceed 75 octets; fold safely at UTF-8 code-point boundaries.
 */
function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) {
    return line;
  }

  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;
  const maxBytesFirstLine = 75;
  const maxBytesContinuation = 74; // Leading space counts as 1 octet

  for (const char of line) {
    const charBytes = encoder.encode(char).length;
    const limit = chunks.length === 0 ? maxBytesFirstLine : maxBytesContinuation;
    if (currentBytes + charBytes > limit && current.length > 0) {
      chunks.push(current);
      current = char;
      currentBytes = charBytes;
    } else {
      current += char;
      currentBytes += charBytes;
    }
  }
  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks.join('\r\n ');
}

function formatIcsDateCompact(isoDate: string): string {
  return isoDate.replace(/-/g, '');
}

function addOneDayISO(isoDate: string): string {
  const parsed = parseISODate(isoDate);
  if (!parsed) return isoDate;
  parsed.setDate(parsed.getDate() + 1);
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, '0');
  const dd = String(parsed.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatUtcTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}` +
    `${pad(date.getUTCMonth() + 1)}` +
    `${pad(date.getUTCDate())}T` +
    `${pad(date.getUTCHours())}` +
    `${pad(date.getUTCMinutes())}` +
    `${pad(date.getUTCSeconds())}Z`
  );
}

function sanitizeSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function buildCaseCalendarICS(
  bereavementCase: BereavementCase,
  procedures: PersonalizedProcedure[],
  options: ExportICSOptions = {}
): ExportICSResult {
  const includeCompleted = options.includeCompleted ?? true;
  const unlockedProcs = procedures.filter((p) => !p.isLockedByPlan);
  const datedProcs = unlockedProcs.filter((p) => Boolean(p.effectiveDeadlineDate));
  const skippedNoDateCount = unlockedProcs.length - datedProcs.length;

  const exportable = datedProcs.filter((p) => {
    if (includeCompleted) return true;
    return !bereavementCase.taskStates[p.id]?.done;
  });

  const nowStamp = formatUtcTimestamp(new Date());
  const baseReminderDays = Math.min(30, Math.max(1, bereavementCase.reminderDaysBefore ?? 7));

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Despues del adios//Calendario de Tramites//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(`Trámites · ${bereavementCase.deceasedName} (Después del adiós)`)}`,
    `X-WR-CALDESC:${escapeIcsText(`Plazos administrativos y orientativos en ${bereavementCase.ccaa}. Herramienta de organización, no sustituye asesoramiento jurídico.`)}`,
    'X-WR-TIMEZONE:Europe/Madrid',
  ];

  for (const proc of exportable) {
    if (!proc.effectiveDeadlineDate) continue;
    const state = bereavementCase.taskStates[proc.id];
    const isDone = Boolean(state?.done);
    const startCompact = formatIcsDateCompact(proc.effectiveDeadlineDate);
    const endCompact = formatIcsDateCompact(addOneDayISO(proc.effectiveDeadlineDate));
    const kindLabel =
      proc.deadlineKind === 'legal' ? 'Plazo legal obligatorio' : 'Fecha orientativa recomendada';

    const descParts: string[] = [
      `Caso: ${bereavementCase.deceasedName} (${bereavementCase.ccaa})`,
      `Fecha límite: ${formatDateES(proc.effectiveDeadlineDate)} · ${kindLabel}`,
      `Estado actual: ${isDone ? 'Marcado como hecho' : 'Pendiente'}`,
    ];

    if (state?.assigneeName) {
      descParts.push(`Responsable asignado: ${state.assigneeName}`);
    }
    if (proc.whatIsIt) {
      descParts.push(`Qué es: ${proc.whatIsIt}`);
    }
    if (proc.effectiveWhereToDoIt) {
      descParts.push(`Dónde se hace: ${proc.effectiveWhereToDoIt}`);
    }
    if (proc.effectiveRequiredDocs.length > 0) {
      descParts.push(`Documentos necesarios: ${proc.effectiveRequiredDocs.join(', ')}`);
    }
    if (proc.regionalNote) {
      descParts.push(`Nota autonómica (${bereavementCase.ccaa}): ${proc.regionalNote}`);
    }
    descParts.push(
      'Aviso: «Después del adiós» es una herramienta informativa y de organización; no constituye asesoramiento jurídico.'
    );

    const summaryText = `${isDone ? '[Hecho] ' : ''}${proc.title} · ${bereavementCase.deceasedName}`;
    const safeUidPart = `${bereavementCase.id}-${proc.id}`.replace(/[^a-zA-Z0-9_-]/g, '');

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${safeUidPart}@despuesdeladios.app`);
    lines.push(`DTSTAMP:${nowStamp}`);
    lines.push(`DTSTART;VALUE=DATE:${startCompact}`);
    lines.push(`DTEND;VALUE=DATE:${endCompact}`);
    lines.push(`SUMMARY:${escapeIcsText(summaryText)}`);
    lines.push(`DESCRIPTION:${escapeIcsText(descParts.join('\n\n'))}`);
    if (proc.effectiveWhereToDoIt) {
      lines.push(`LOCATION:${escapeIcsText(proc.effectiveWhereToDoIt)}`);
    }
    lines.push(`CATEGORIES:${escapeIcsText(proc.deadlineKind === 'legal' ? 'Plazo legal' : 'Orientativo')}`);
    lines.push('STATUS:CONFIRMED');
    lines.push('TRANSP:TRANSPARENT');

    if (!isDone) {
      const alarmDays =
        proc.deadlineUnit === 'days' && proc.deadlineValue > 0 && proc.deadlineValue <= 7
          ? Math.min(baseReminderDays, Math.max(1, Math.floor(proc.deadlineValue / 2)))
          : baseReminderDays;
      lines.push('BEGIN:VALARM');
      lines.push('ACTION:DISPLAY');
      lines.push(`DESCRIPTION:${escapeIcsText(`Recordatorio de plazo: ${proc.title}`)}`);
      lines.push(`TRIGGER:-P${alarmDays}D`);
      lines.push('END:VALARM');
    }

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  const icsContent = `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
  const slug = sanitizeSlug(bereavementCase.deceasedName) || 'caso';
  const filename = `calendario-${slug}-despues-del-adios.ics`;

  return {
    exportedCount: exportable.length,
    skippedNoDateCount,
    filename,
    icsContent,
  };
}

export function downloadCaseCalendarICS(
  bereavementCase: BereavementCase,
  procedures: PersonalizedProcedure[],
  options: ExportICSOptions = {}
): ExportICSResult {
  const result = buildCaseCalendarICS(bereavementCase, procedures, options);
  if (result.exportedCount === 0) {
    return result;
  }

  const blob = new Blob([result.icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = result.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return result;
}
