import type { BereavementCase, FamilyInvitation, UserProfile } from '../types/domain';

export type ContactPaymentStatus = 'paid_stripe' | 'paid_code' | 'pending' | 'family_invited';

export interface AdminContactRow {
  key: string;
  email: string;
  displayName: string;
  roleLabel: string;
  paymentStatus: ContactPaymentStatus;
  paymentLabel: string;
  casesCount: number;
  paidCasesCount: number;
  primaryCase: BereavementCase | null;
  deceasedNames: string[];
  ccaas: string[];
  reminderEmails: string[];
  createdAt: string;
  updatedAt: string;
}

function getCasePaymentLabel(c: BereavementCase): string {
  if (c.unlocked && c.unlockMethod === 'stripe') return 'Pagado (Stripe)';
  if (c.unlocked && c.unlockMethod === 'partner_code') {
    return c.unlockCodeUsed ? `Código (${c.unlockCodeUsed})` : 'Código entidad';
  }
  if (c.unlocked) return 'Activo';
  return 'Pendiente de pago';
}

export function buildAdminContactRows(
  users: UserProfile[],
  cases: BereavementCase[],
  invitations: FamilyInvitation[]
): AdminContactRow[] {
  const byEmail = new Map<
    string,
    {
      email: string;
      displayName: string;
      user: UserProfile | null;
      ownedCases: BereavementCase[];
      invitedCases: Set<string>;
      createdAt: string;
      updatedAt: string;
    }
  >();

  const ensureEntry = (rawEmail: string, fallbackName = '') => {
    const cleanEmail = rawEmail.trim();
    const key = cleanEmail.toLowerCase();
    let entry = byEmail.get(key);
    if (!entry) {
      entry = {
        email: cleanEmail,
        displayName: fallbackName.trim(),
        user: null,
        ownedCases: [],
        invitedCases: new Set<string>(),
        createdAt: '',
        updatedAt: '',
      };
      byEmail.set(key, entry);
    }
    if (!entry.displayName && fallbackName.trim()) {
      entry.displayName = fallbackName.trim();
    }
    return entry;
  };

  for (const u of users) {
    if (!u.email) continue;
    const entry = ensureEntry(u.email, u.displayName);
    entry.user = u;
    if (u.displayName) entry.displayName = u.displayName;
    if (!entry.createdAt || (u.createdAt && u.createdAt < entry.createdAt)) {
      entry.createdAt = u.createdAt;
    }
    if (u.updatedAt && u.updatedAt > entry.updatedAt) {
      entry.updatedAt = u.updatedAt;
    }
  }

  for (const c of cases) {
    if (!c.ownerEmail) continue;
    const entry = ensureEntry(c.ownerEmail, c.ownerName);
    entry.ownedCases.push(c);
    if (!entry.createdAt || (c.createdAt && c.createdAt < entry.createdAt)) {
      entry.createdAt = c.createdAt;
    }
    if (c.updatedAt && c.updatedAt > entry.updatedAt) {
      entry.updatedAt = c.updatedAt;
    }
  }

  for (const inv of invitations) {
    if (!inv.invitedEmail || inv.status === 'revoked') continue;
    const entry = ensureEntry(inv.invitedEmail);
    if (inv.caseTitle) entry.invitedCases.add(inv.caseTitle);
    if (!entry.createdAt || (inv.createdAt && inv.createdAt < entry.createdAt)) {
      entry.createdAt = inv.createdAt;
    }
    if (inv.updatedAt && inv.updatedAt > entry.updatedAt) {
      entry.updatedAt = inv.updatedAt;
    }
  }

  const rows: AdminContactRow[] = [];

  for (const [key, entry] of byEmail.entries()) {
    const sortedCases = [...entry.ownedCases].sort((a, b) =>
      (b.updatedAt || '').localeCompare(a.updatedAt || '')
    );
    const paidCases = sortedCases.filter((c) => c.unlocked);
    const hasStripe = paidCases.some((c) => c.unlockMethod === 'stripe');
    const hasCode = paidCases.some((c) => c.unlockMethod === 'partner_code');

    let paymentStatus: ContactPaymentStatus = 'pending';
    let paymentLabel = 'Registrado sin pago';
    let roleLabel = 'Usuario';

    if (sortedCases.length > 0) {
      roleLabel = sortedCases.length === 1 ? 'Titular de caso' : `Titular (${sortedCases.length} casos)`;
      if (hasStripe) {
        paymentStatus = 'paid_stripe';
        paymentLabel = 'Pagado (Stripe)';
      } else if (hasCode) {
        paymentStatus = 'paid_code';
        paymentLabel = getCasePaymentLabel(paidCases[0]);
      } else if (paidCases.length > 0) {
        paymentStatus = 'paid_stripe';
        paymentLabel = 'Activo';
      } else {
        paymentStatus = 'pending';
        paymentLabel = 'Pendiente de pago';
      }
    } else if (entry.invitedCases.size > 0) {
      roleLabel = 'Familiar invitado';
      paymentStatus = 'family_invited';
      paymentLabel = entry.user ? 'Acceso por invitación' : 'Invitación pendiente';
    }

    const deceasedNames = Array.from(
      new Set([
        ...sortedCases.map((c) => c.deceasedName).filter(Boolean),
        ...Array.from(entry.invitedCases),
      ])
    );

    const ccaas = Array.from(new Set(sortedCases.map((c) => c.ccaa).filter(Boolean)));
    const reminderEmails = Array.from(
      new Set(sortedCases.map((c) => (c.reminderEmail || '').trim()).filter(Boolean))
    );

    rows.push({
      key,
      email: entry.email,
      displayName: entry.displayName || entry.email.split('@')[0] || 'Sin nombre',
      roleLabel,
      paymentStatus,
      paymentLabel,
      casesCount: sortedCases.length,
      paidCasesCount: paidCases.length,
      primaryCase: sortedCases[0] || null,
      deceasedNames,
      ccaas,
      reminderEmails,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    });
  }

  rows.sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));
  return rows;
}

function escapeCsvCell(raw: string | number): string {
  const str = String(raw ?? '');
  const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function buildContactsCsv(rows: AdminContactRow[]): string {
  const headers = [
    'Nombre',
    'Correo electrónico',
    'Tipo de contacto',
    'Estado de pago',
    'Casos creados',
    'Casos pagados',
    'Fallecidos / Expedientes',
    'Comunidad Autónoma',
    'Correo de avisos',
    'Fecha de alta',
    'Última actividad',
  ];

  const lines = [headers.map(escapeCsvCell).join(';')];
  for (const r of rows) {
    lines.push(
      [
        r.displayName,
        r.email,
        r.roleLabel,
        r.paymentLabel,
        r.casesCount,
        r.paidCasesCount,
        r.deceasedNames.join(' / '),
        r.ccaas.join(' / '),
        r.reminderEmails.join(' / '),
        r.createdAt ? r.createdAt.slice(0, 10) : '',
        r.updatedAt ? r.updatedAt.slice(0, 10) : '',
      ]
        .map(escapeCsvCell)
        .join(';')
    );
  }

  // UTF-8 BOM so Spanish Excel automatically detects accents and semicolon columns
  return `\uFEFF${lines.join('\r\n')}`;
}

export function triggerFileDownload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
