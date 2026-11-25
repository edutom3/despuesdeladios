import { auth } from '../firebase';
import type { BereavementCase, PersonalizedProcedure } from '../types/domain';

export interface ServerReminderRecord {
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

export interface UpcomingReminderTrigger {
  procedureId: string;
  title: string;
  effectiveDeadlineDate: string;
  deadlineKind: 'legal' | 'recommended' | 'none';
  daysUntil: number | null;
  plannedNoticeDate: string | null;
  advanceSentAt: string | null;
  finalSentAt: string | null;
}

export type EmailProvider = 'gmail' | 'resend' | 'none';

export interface ReminderStatusResponse {
  resendConfigured: boolean;
  emailProvider?: EmailProvider;
  fromAddress: string;
  upcomingTriggers: UpcomingReminderTrigger[];
  history: ServerReminderRecord[];
}

export async function syncCaseRemindersWithServer(
  bereavementCase: BereavementCase,
  procedures: PersonalizedProcedure[],
  options?: { runAutoCheck?: boolean; recipientName?: string }
): Promise<{
  synced: boolean;
  resendConfigured: boolean;
  emailProvider?: EmailProvider;
  autoDispatchedRecord: ServerReminderRecord | null;
}> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error('Sesión no disponible.');
  }

  const deadlineProcedures = procedures
    .filter((p) => !p.isLockedByPlan && Boolean(p.effectiveDeadlineDate))
    .map((p) => ({
      id: p.id,
      title: p.title,
      effectiveDeadlineDate: p.effectiveDeadlineDate as string,
      deadlineKind: p.deadlineKind,
      priorityBucket: p.priorityBucket,
      whereToDoIt: p.effectiveWhereToDoIt,
      requiredDocs: p.effectiveRequiredDocs.slice(0, 8),
      done: Boolean(bereavementCase.taskStates[p.id]?.done),
    }));

  const resp = await fetch('/api/reminders/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      caseId: bereavementCase.id,
      ownerUid: bereavementCase.ownerId,
      memberUids: bereavementCase.memberUids,
      deceasedName: bereavementCase.deceasedName,
      ccaa: bereavementCase.ccaa,
      recipientEmail: bereavementCase.reminderEmail || bereavementCase.ownerEmail,
      recipientName: options?.recipientName || bereavementCase.ownerName,
      enabled: bereavementCase.reminderEnabled ?? true,
      daysBefore: bereavementCase.reminderDaysBefore ?? 7,
      onlyLegalDeadlines: bereavementCase.reminderOnlyLegal ?? false,
      appOrigin: window.location.origin,
      procedures: deadlineProcedures,
      runAutoCheck: Boolean(options?.runAutoCheck),
    }),
  });

  const data = (await resp.json()) as {
    synced?: boolean;
    resendConfigured?: boolean;
    emailProvider?: EmailProvider;
    autoDispatchedRecord?: ServerReminderRecord | null;
    error?: string;
  };
  if (!resp.ok) {
    throw new Error(data.error || 'No se pudieron sincronizar los avisos automáticos.');
  }

  return {
    synced: Boolean(data.synced),
    resendConfigured: Boolean(data.resendConfigured),
    emailProvider: data.emailProvider,
    autoDispatchedRecord: data.autoDispatchedRecord || null,
  };
}

export async function fetchCaseReminderStatus(caseId: string): Promise<ReminderStatusResponse> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error('Sesión no disponible.');
  }
  const resp = await fetch(`/api/reminders/status/${encodeURIComponent(caseId)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const data = (await resp.json()) as ReminderStatusResponse & { error?: string };
  if (!resp.ok) {
    throw new Error(data.error || 'No se pudo consultar el estado de los avisos.');
  }
  return data;
}

export async function runCaseReminderNow(params: {
  caseId: string;
  mode: 'manual_summary' | 'test' | 'auto_check';
  overrideEmail?: string;
}): Promise<{
  record: ServerReminderRecord | null;
  mailtoHref?: string;
  resendConfigured?: boolean;
  emailProvider?: EmailProvider;
}> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error('Sesión no disponible.');
  }
  const resp = await fetch('/api/reminders/run-now', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(params),
  });
  const data = (await resp.json()) as {
    record?: ServerReminderRecord | null;
    mailtoHref?: string;
    resendConfigured?: boolean;
    emailProvider?: EmailProvider;
    error?: string;
  };
  if (!resp.ok) {
    throw new Error(data.error || 'No se pudo enviar el aviso.');
  }
  return {
    record: data.record || null,
    mailtoHref: data.mailtoHref,
    resendConfigured: data.resendConfigured,
    emailProvider: data.emailProvider,
  };
}

export async function deleteCaseReminderSchedule(caseId: string): Promise<void> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) return;
  await fetch(`/api/reminders/case/${encodeURIComponent(caseId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }).catch(() => {});
}
