import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Compass,
  Download,
  Edit2,
  FileText,
  HelpCircle,
  Home,
  ListChecks,
  Lock,
  MessageSquare,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { CASE_PRICE_LABEL } from '../config/pricing';
import { ADMIN_EMAIL } from '../firebase';
import {
  addCaseNote,
  deleteCaseNote,
  saveCaseReminderLog,
  subscribeCaseDocuments,
  subscribeCaseInvitations,
  subscribeCaseMembers,
  subscribeCaseNotes,
  subscribeCaseReminders,
  updateCaseTaskState,
} from '../services/firestoreService';
import { syncCaseRemindersWithServer } from '../services/remindersClient';
import type {
  BereavementCase,
  CaseDocument,
  CaseMember,
  CaseNote,
  CaseReminderLog,
  FamilyInvitation,
  LegalAlert,
  PersonalizedProcedure,
  ProcedureCatalogItem,
  ProfessionalEntry,
} from '../types/domain';
import {
  buildPersonalizedProcedures,
  daysSinceDate,
  formatDateES,
  getMatchingLegalAlerts,
  normalizeDocKey,
  summarizeAnswersES,
} from '../utils/caseEngine';
import { downloadCaseSummaryPDF } from '../utils/pdfExport';
import { CaseCalendarTab } from './CaseCalendarTab';
import { CaseDocumentsTab } from './CaseDocumentsTab';
import { CaseFamilyTab } from './CaseFamilyTab';
import { CaseToolsPanel } from './CaseToolsPanel';
import { LegalDisclaimerFooter } from './LegalDisclaimerFooter';
import { LegalFaqDrawer } from './LegalFaqDrawer';
import { UnlockCaseModal } from './UnlockCaseModal';

interface CaseWorkspaceProps {
  user: User;
  bereavementCase: BereavementCase;
  catalog: ProcedureCatalogItem[];
  legalAlerts: LegalAlert[];
  professionals: ProfessionalEntry[];
  onBack: () => void;
  onEditAnswers: () => void;
}

type CaseTab = 'resumen' | 'tramites' | 'calendario' | 'documentos' | 'familia' | 'herramientas';

export const CaseWorkspace: React.FC<CaseWorkspaceProps> = ({
  user,
  bereavementCase,
  catalog,
  legalAlerts,
  professionals,
  onBack,
  onEditAnswers,
}) => {
  const [activeTab, setActiveTab] = useState<CaseTab>('resumen');
  const [procFilter, setProcFilter] = useState<'all' | 'pending' | 'done'>('all');
  const [selectedProcId, setSelectedProcId] = useState<string | null>(null);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [faqOpen, setFaqOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const [members, setMembers] = useState<CaseMember[]>([]);
  const [invitations, setInvitations] = useState<FamilyInvitation[]>([]);
  const [notes, setNotes] = useState<CaseNote[]>([]);
  const [uploadedDocs, setUploadedDocs] = useState<CaseDocument[]>([]);
  const [reminderLogs, setReminderLogs] = useState<CaseReminderLog[]>([]);
  const [toolsSubTab, setToolsSubTab] = useState<'assistant' | 'templates' | 'directory' | 'reminders'>('assistant');
  const [newNoteText, setNewNoteText] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);

  const isOwner = bereavementCase.ownerId === user.uid;
  const isAdmin = user.email === ADMIN_EMAIL && user.emailVerified;
  const canCollaborate =
    isOwner || bereavementCase.collaboratorUids.includes(user.uid);
  const userName = user.displayName || user.email?.split('@')[0] || 'Familiar';

  useEffect(() => {
    const unsubMembers = subscribeCaseMembers(bereavementCase.id, setMembers);
    const unsubNotes = subscribeCaseNotes(bereavementCase.id, setNotes);
    const unsubDocs = subscribeCaseDocuments(bereavementCase.id, setUploadedDocs);
    const unsubReminders = subscribeCaseReminders(bereavementCase.id, setReminderLogs);
    const unsubInvites = isOwner
      ? subscribeCaseInvitations(bereavementCase.id, user.uid, setInvitations)
      : () => {};
    return () => {
      unsubMembers();
      unsubNotes();
      unsubDocs();
      unsubReminders();
      unsubInvites();
    };
  }, [bereavementCase.id, isOwner, user.uid]);

  const procedures = buildPersonalizedProcedures(bereavementCase, catalog);
  const matchingAlerts = getMatchingLegalAlerts(bereavementCase, procedures, legalAlerts);
  const selectedProc = procedures.find((p) => p.id === selectedProcId) || null;

  // Automatically keep server-side Resend deadline scheduler synced with current case state
  useEffect(() => {
    if (!canCollaborate || typeof navigator !== 'undefined' && !navigator.onLine) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void syncCaseRemindersWithServer(bereavementCase, procedures, {
        runAutoCheck: Boolean(bereavementCase.reminderEnabled ?? true),
        recipientName: userName,
      })
        .then((res) => {
          if (cancelled || !res.autoDispatchedRecord) return;
          return saveCaseReminderLog(bereavementCase.id, user, res.autoDispatchedRecord);
        })
        .catch(() => {});
    }, 600);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    canCollaborate,
    bereavementCase.id,
    bereavementCase.updatedAt,
    bereavementCase.reminderEnabled,
    bereavementCase.reminderEmail,
    bereavementCase.reminderDaysBefore,
    bereavementCase.reminderOnlyLegal,
    catalog.length,
    user,
    userName,
  ]);

  const daysElapsed = daysSinceDate(bereavementCase.deathDate);
  const doneCount = procedures.filter((p) => bereavementCase.taskStates[p.id]?.done).length;

  const dueSoonProcedures = procedures.filter(
    (p) =>
      !p.isLockedByPlan &&
      !bereavementCase.taskStates[p.id]?.done &&
      (p.urgencyStatus === 'due_soon' || p.urgencyStatus === 'overdue')
  );

  const topThreeFirst = procedures
    .filter((p) => !bereavementCase.taskStates[p.id]?.done)
    .slice(0, 3);

  const upcomingDeadlines = procedures
    .filter((p) => !p.isLockedByPlan && !bereavementCase.taskStates[p.id]?.done && p.effectiveDeadlineDate)
    .sort((a, b) =>
      (a.effectiveDeadlineDate || '').localeCompare(b.effectiveDeadlineDate || '')
    )
    .slice(0, 5);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  };

  const handleToggleTaskDone = async (proc: PersonalizedProcedure) => {
    if (!canCollaborate || proc.isLockedByPlan) return;
    const prev = bereavementCase.taskStates[proc.id] || { done: false };
    const nextDone = !prev.done;
    await updateCaseTaskState(bereavementCase.id, bereavementCase.taskStates, proc.id, {
      ...prev,
      done: nextDone,
      doneAt: nextDone ? new Date().toISOString() : undefined,
      doneByUid: nextDone ? user.uid : undefined,
      doneByName: nextDone ? userName : undefined,
    });
  };

  const handleAssignMember = async (proc: PersonalizedProcedure, memberUid: string) => {
    if (!canCollaborate || proc.isLockedByPlan) return;
    const prev = bereavementCase.taskStates[proc.id] || { done: false };
    const targetMember = members.find((m) => m.uid === memberUid);
    await updateCaseTaskState(bereavementCase.id, bereavementCase.taskStates, proc.id, {
      ...prev,
      assigneeUid: targetMember ? targetMember.uid : undefined,
      assigneeName: targetMember ? targetMember.displayName : undefined,
    });
  };

  const handleAddNote = async (e: React.FormEvent, procId: string) => {
    e.preventDefault();
    if (!canCollaborate || !newNoteText.trim()) return;
    setNoteBusy(true);
    try {
      await addCaseNote(bereavementCase.id, user, procId, newNoteText);
      setNewNoteText('');
    } finally {
      setNoteBusy(false);
    }
  };

  const filterProcedures = (bucket: PersonalizedProcedure['priorityBucket']) =>
    procedures.filter((p) => {
      if (p.priorityBucket !== bucket) return false;
      const isDone = Boolean(bereavementCase.taskStates[p.id]?.done);
      if (procFilter === 'pending') return !isDone;
      if (procFilter === 'done') return isDone;
      return true;
    });

  const navTabs: Array<{ id: CaseTab; label: string; shortLabel: string; icon: React.FC<{ className?: string }> }> = [
    { id: 'resumen', label: 'Resumen', shortLabel: 'Resumen', icon: Home },
    { id: 'tramites', label: 'Trámites', shortLabel: 'Trámites', icon: ListChecks },
    { id: 'calendario', label: 'Calendario', shortLabel: 'Plazos', icon: Calendar },
    { id: 'documentos', label: 'Documentos', shortLabel: 'Papeles', icon: FileText },
    { id: 'familia', label: 'Familia', shortLabel: 'Familia', icon: Users },
    { id: 'herramientas', label: 'Ayuda y escritos', shortLabel: 'Ayuda', icon: Compass },
  ];

  const renderProcRow = (proc: PersonalizedProcedure) => {
    const state = bereavementCase.taskStates[proc.id];
    const isDone = Boolean(state?.done);

    if (proc.isLockedByPlan) {
      return (
        <button
          key={proc.id}
          type="button"
          onClick={() => setShowUnlockModal(true)}
          className="w-full text-left rounded-xl border border-[#E7E2D8] bg-[#F7F5F0] p-4 flex items-center justify-between gap-4 opacity-90 hover:border-[#CBBCA2]"
        >
          <div className="flex items-start gap-3 min-w-0">
            <Lock className="w-4 h-4 text-[#8F754B] mt-1 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#45484F]">{proc.title}</p>
              <p className="text-xs text-[#7A7D85] mt-0.5">
                Incluido al desbloquear el caso completo
              </p>
            </div>
          </div>
          <span className="text-xs font-medium text-[#7D633A] whitespace-nowrap shrink-0">
            Desbloquear
          </span>
        </button>
      );
    }

    const deadlineNote = proc.effectiveDeadlineDate
      ? `${formatDateES(proc.effectiveDeadlineDate)} · ${
          proc.deadlineKind === 'legal' ? 'Plazo legal' : 'Fecha orientativa'
        }`
      : 'Sin fecha fija';

    return (
      <div
        key={proc.id}
        className="rounded-xl border border-[#E7E2D8] bg-white p-4 flex items-start justify-between gap-3 hover:border-[#CBBCA2] transition-colors"
      >
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <button
            type="button"
            onClick={() => void handleToggleTaskDone(proc)}
            disabled={!canCollaborate}
            aria-label={isDone ? `Marcar ${proc.title} como pendiente` : `Marcar ${proc.title} como hecho`}
            className={`mt-0.5 min-w-[28px] h-7 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
              isDone
                ? 'bg-[#2C6B4B] border-[#2C6B4B] text-white'
                : 'bg-[#FAF8F5] border-[#C9C0B1] text-transparent hover:border-[#8F754B]'
            }`}
          >
            <Check className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setSelectedProcId(proc.id)}
            className="text-left min-w-0 flex-1"
          >
            <p
              className={`text-sm sm:text-base font-medium leading-snug ${
                isDone ? 'line-through text-[#7A7D85]' : 'text-[#141518]'
              }`}
            >
              {proc.title}
            </p>
            <p className="mt-1 text-xs text-[#666A73] font-mono-num">
              {deadlineNote}
              {proc.urgencyStatus === 'due_soon' && !isDone ? ' · Vence pronto' : ''}
              {proc.urgencyStatus === 'overdue' && !isDone ? ' · Fecha pasada' : ''}
              {state?.assigneeName ? ` · Responsable: ${state.assigneeName}` : ''}
            </p>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setSelectedProcId(proc.id)}
          className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[#7A7D85] hover:bg-[#FAF8F5] hover:text-[#141518] shrink-0"
          aria-label={`Abrir ficha de ${proc.title}`}
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    );
  };

  if (!bereavementCase.unlocked && !isAdmin) {
    return (
      <div className="min-h-screen flex flex-col bg-[#FAF8F5] text-[#1C1E22]">
        <header className="sticky top-0 z-30 border-b border-[#E7E2D8] bg-[#FAF8F5]/95 backdrop-blur-md">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={onBack}
              className="min-h-[40px] inline-flex items-center gap-2 text-sm font-medium text-[#45484F] hover:text-[#141518]"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver a Mis casos</span>
            </button>
            <span className="text-xs font-mono-num text-[#7D633A]">Caso pendiente de activación</span>
          </div>
        </header>

        <main className="flex-1 max-w-xl w-full mx-auto px-4 sm:px-6 py-12 flex items-center">
          <div className="w-full rounded-2xl bg-white border border-[#E7E2D8] p-6 sm:p-8 space-y-5 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-medium text-[#8F754B]">
              <Lock className="w-4 h-4" />
              <span>Acceso de pago requerido</span>
            </div>
            <h1 className="font-display text-3xl font-semibold text-[#141518]">
              Activa el caso de {bereavementCase.deceasedName}
            </h1>
            <p className="text-sm text-[#5B5E65] leading-relaxed">
              Para consultar la lista personalizada de trámites, el calendario con plazos legales,
              la carpeta de documentos, los modelos de escritos y las invitaciones familiares es
              necesario activar este caso con un pago único de {CASE_PRICE_LABEL} o con un código
              de tu funeraria o aseguradora.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowUnlockModal(true)}
                className="flex-1 min-h-[48px] px-5 rounded-xl bg-[#141518] text-[#F6F4EF] text-sm font-semibold hover:bg-[#25272D]"
              >
                Activar ahora ({CASE_PRICE_LABEL} o código)
              </button>
              <button
                type="button"
                onClick={onBack}
                className="min-h-[48px] px-5 rounded-xl border border-[#D8D0C2] bg-white text-sm font-medium text-[#45484F] hover:bg-[#F5F1EA]"
              >
                Volver
              </button>
            </div>
          </div>
        </main>

        <LegalDisclaimerFooter variant="light" />

        {showUnlockModal && (
          <UnlockCaseModal
            bereavementCase={bereavementCase}
            onClose={() => setShowUnlockModal(false)}
            onUnlocked={(msg) => {
              setShowUnlockModal(false);
              showToast(msg);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F5] text-[#1C1E22] pb-20 md:pb-0">
      {/* Compact Top Bar */}
      <header className="sticky top-0 z-30 border-b border-[#E7E2D8] bg-[#FAF8F5]/95 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[#45484F] hover:bg-[#EFECE5] shrink-0"
              aria-label="Volver a Mis casos"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-semibold text-[#141518] truncate">
                {bereavementCase.deceasedName}
              </h1>
              <p className="text-[11px] text-[#666A73] truncate font-mono-num">
                {bereavementCase.ccaa} · Hace {daysElapsed} días · {doneCount}/{procedures.length}{' '}
                hechos
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!bereavementCase.unlocked && (
              <button
                type="button"
                onClick={() => setShowUnlockModal(true)}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#8F754B] text-white text-xs font-semibold hover:bg-[#7A633E] whitespace-nowrap"
              >
                Desbloquear
              </button>
            )}
            <button
              type="button"
              onClick={() => setFaqOpen(true)}
              className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[#D8D0C2] bg-white text-xs font-medium text-[#1C1E22] hover:bg-[#F5F1EA] inline-flex items-center gap-1.5 whitespace-nowrap"
              aria-label="Abrir preguntas frecuentes"
            >
              <HelpCircle className="w-3.5 h-3.5 text-[#8F754B]" />
              <span className="hidden sm:inline">Dudas frecuentes</span>
            </button>
            <button
              type="button"
              onClick={() => downloadCaseSummaryPDF(bereavementCase, procedures, uploadedDocs)}
              className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[#D8D0C2] bg-white text-xs font-medium text-[#1C1E22] hover:bg-[#F5F1EA] inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-[#8F754B]" />
              <span className="hidden sm:inline">PDF</span>
            </button>
          </div>
        </div>

        {/* Desktop Sub-Navigation */}
        <nav className="hidden md:block border-t border-[#EFECE5] bg-white">
          <div className="max-w-6xl mx-auto px-6 flex items-center gap-6 overflow-x-auto">
            {navTabs.map((t) => {
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'border-[#8F754B] text-[#141518]'
                      : 'border-transparent text-[#666A73] hover:text-[#141518]'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </nav>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {toastMsg && (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            {toastMsg}
          </div>
        )}

        {!canCollaborate && (
          <div className="rounded-xl border border-[#D6C3A5] bg-[#F7F2E8] px-4 py-2.5 text-xs text-[#4F3D22]">
            Tienes permiso de <strong>Solo ver</strong> en este caso. Puedes consultar todos los
            trámites, plazos y documentos.
          </div>
        )}

        {/* TAB 1: RESUMEN */}
        {activeTab === 'resumen' && (
          <div className="space-y-6">
            {/* Yellow 14-day urgent alert banner */}
            {dueSoonProcedures.length > 0 && (
              <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-950 font-mono-num">
                      {dueSoonProcedures.length}{' '}
                      {dueSoonProcedures.length === 1
                        ? 'plazo vence pronto o requiere atención'
                        : 'plazos vencen en los próximos 14 días o requieren atención'}
                    </p>
                    <p className="text-xs sm:text-sm text-amber-900 mt-1">
                      {dueSoonProcedures
                        .slice(0, 3)
                        .map((p) => p.title)
                        .join(' · ')}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('tramites')}
                  className="min-h-[40px] px-4 rounded-xl bg-amber-900 text-white text-xs font-semibold hover:bg-amber-950 shrink-0"
                >
                  Ver trámites
                </button>
              </div>
            )}

            {/* Legal Alerts Banner (Step 5) */}
            {matchingAlerts.length > 0 && (
              <div className="rounded-2xl border border-[#CBBCA2] bg-white p-5 space-y-3">
                <p className="text-xs font-semibold text-[#7D633A]">
                  Actualizaciones normativas aplicables a {bereavementCase.ccaa}
                </p>
                {matchingAlerts.map((alert) => (
                  <div key={alert.id} className="pt-2 border-t border-[#EFECE5] first:border-t-0 first:pt-0">
                    <p className="text-sm font-semibold text-[#141518]">{alert.title}</p>
                    <p className="text-xs sm:text-sm text-[#5B5E65] mt-1 leading-relaxed">
                      {alert.summary}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div className="grid lg:grid-cols-12 gap-6">
              {/* Left Column: Haz esto primero */}
              <div className="lg:col-span-7 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#141518]">
                    Haz esto primero
                  </h2>
                  <button
                    type="button"
                    onClick={() => setActiveTab('tramites')}
                    className="text-xs sm:text-sm font-medium text-[#7D633A] hover:underline"
                  >
                    Ver lista completa ({procedures.length})
                  </button>
                </div>

                {topThreeFirst.length === 0 ? (
                  <div className="rounded-2xl bg-white border border-[#E7E2D8] p-6 text-sm text-[#45484F]">
                    Todos los trámites mostrados están marcados como hechos.
                  </div>
                ) : (
                  <div className="space-y-3">{topThreeFirst.map(renderProcRow)}</div>
                )}

                {/* Upcoming Deadlines */}
                <div className="rounded-2xl bg-white border border-[#E7E2D8] p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-[#141518]">Próximas fechas</h3>
                    <button
                      type="button"
                      onClick={() => setActiveTab('calendario')}
                      className="text-xs font-medium text-[#7D633A] hover:underline"
                    >
                      Abrir calendario
                    </button>
                  </div>
                  {upcomingDeadlines.length === 0 ? (
                    <p className="text-xs text-[#666A73]">No quedan fechas próximas pendientes.</p>
                  ) : (
                    <div className="divide-y divide-[#EFECE5]">
                      {upcomingDeadlines.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSelectedProcId(p.id)}
                          className="w-full py-2.5 text-left flex items-center justify-between gap-3 hover:bg-[#FAF8F5] px-1 rounded"
                        >
                          <span className="text-sm text-[#1C1E22] truncate">{p.title}</span>
                          <span className="text-xs font-mono-num text-[#666A73] whitespace-nowrap shrink-0">
                            {formatDateES(p.effectiveDeadlineDate)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Case Info, PDF, Unlock */}
              <div className="lg:col-span-5 space-y-4">
                <div className="rounded-2xl bg-white border border-[#E7E2D8] p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-[#141518]">Datos del caso</h3>
                      <p className="text-xs text-[#666A73] mt-0.5 font-mono-num">
                        Fallecimiento: {formatDateES(bereavementCase.deathDate)} ·{' '}
                        {bereavementCase.ccaa}
                      </p>
                    </div>
                    {isOwner && (
                      <button
                        type="button"
                        onClick={onEditAnswers}
                        className="min-h-[38px] px-3 rounded-xl border border-[#D8D0C2] text-xs font-medium text-[#1C1E22] hover:bg-[#F5F1EA] inline-flex items-center gap-1.5 shrink-0"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Cambiar respuestas</span>
                      </button>
                    )}
                  </div>

                  <p className="text-xs text-[#5B5E65] leading-relaxed">
                    {summarizeAnswersES(bereavementCase.answers)}
                  </p>

                  <div className="pt-3 border-t border-[#EFECE5] flex flex-col gap-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        downloadCaseSummaryPDF(bereavementCase, procedures, uploadedDocs)
                      }
                      className="w-full min-h-[44px] rounded-xl bg-[#141518] text-[#F6F4EF] text-sm font-medium hover:bg-[#25272D] inline-flex items-center justify-center gap-2"
                    >
                      <Download className="w-4 h-4 text-[#D6C3A5]" />
                      <span>Descargar resumen en PDF</span>
                    </button>

                    {!bereavementCase.unlocked && (
                      <button
                        type="button"
                        onClick={() => setShowUnlockModal(true)}
                        className="w-full min-h-[44px] rounded-xl border border-[#8F754B] bg-[#FAF8F5] text-[#7D633A] text-sm font-semibold hover:bg-[#F1ECE2]"
                      >
                        Desbloquear caso completo ({CASE_PRICE_LABEL} o código)
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setToolsSubTab('reminders');
                        setActiveTab('herramientas');
                      }}
                      className="w-full min-h-[42px] rounded-xl border border-[#E2DDD3] bg-[#FAF8F5] px-3.5 text-xs font-medium text-[#45484F] hover:bg-[#F1ECE2] flex items-center justify-between gap-2"
                    >
                      <span className="truncate">
                        {(bereavementCase.reminderEnabled ?? true)
                          ? `Avisos automáticos activos (${bereavementCase.reminderDaysBefore ?? 7} días antes)`
                          : 'Avisos automáticos por correo pausados'}
                      </span>
                      <span className="text-[#7D633A] font-semibold shrink-0">Configurar</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFaqOpen(true)}
                      className="w-full min-h-[42px] rounded-xl border border-[#E2DDD3] bg-[#FAF8F5] px-3.5 text-xs font-medium text-[#45484F] hover:bg-[#F1ECE2] flex items-center justify-between gap-2"
                    >
                      <span className="truncate">Preguntas frecuentes sobre trámites</span>
                      <span className="text-[#7D633A] font-semibold shrink-0">Consultar</span>
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-[#E7E2D8] bg-[#F5F2EC] p-4 text-xs text-[#5B5E65] leading-relaxed">
                  «Después del adiós» es una herramienta de organización e información práctica. No
                  ofrece asesoramiento jurídico, fiscal o notarial.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: TRÁMITES */}
        {activeTab === 'tramites' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#141518]">
                  Lista personalizada de trámites
                </h2>
                <p className="text-xs sm:text-sm text-[#666A73] font-mono-num">
                  {doneCount} de {procedures.length} completados · {bereavementCase.ccaa}
                </p>
              </div>

              <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#EFECE5] border border-[#E2DDD3] self-start">
                {(
                  [
                    { id: 'all', label: 'Todos' },
                    { id: 'pending', label: 'Pendientes' },
                    { id: 'done', label: 'Hechos' },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setProcFilter(f.id)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      procFilter === f.id
                        ? 'bg-white text-[#141518] shadow-sm'
                        : 'text-[#5B5E65] hover:text-[#141518]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {(
              [
                { bucket: 'first', title: 'Haz esto primero' },
                { bucket: 'months', title: 'En los próximos meses' },
                { bucket: 'later', title: 'Más adelante' },
              ] as const
            ).map((group) => {
              const items = filterProcedures(group.bucket);
              if (items.length === 0) return null;
              return (
                <section key={group.bucket} className="space-y-3">
                  <h3 className="text-base font-semibold text-[#141518]">{group.title}</h3>
                  <div className="space-y-2.5">{items.map(renderProcRow)}</div>
                </section>
              );
            })}
          </div>
        )}

        {/* TAB 3: CALENDARIO */}
        {activeTab === 'calendario' && (
          <CaseCalendarTab
            bereavementCase={bereavementCase}
            procedures={procedures}
            onSelectProcedure={(proc) => setSelectedProcId(proc.id)}
            onOpenUnlock={() => setShowUnlockModal(true)}
          />
        )}

        {/* TAB 4: DOCUMENTOS */}
        {activeTab === 'documentos' && (
          <CaseDocumentsTab
            bereavementCase={bereavementCase}
            procedures={procedures}
            uploadedDocs={uploadedDocs}
            user={user}
            canCollaborate={canCollaborate}
            onOpenUnlock={() => setShowUnlockModal(true)}
          />
        )}

        {/* TAB 5: FAMILIA */}
        {activeTab === 'familia' && (
          <CaseFamilyTab
            bereavementCase={bereavementCase}
            members={members}
            invitations={invitations}
            procedures={procedures}
            isOwner={isOwner}
            onOpenUnlock={() => setShowUnlockModal(true)}
          />
        )}

        {/* TAB 6: HERRAMIENTAS (IA, ESCRITOS, DIRECTORIO, RECORDATORIOS) */}
        {activeTab === 'herramientas' && (
          <CaseToolsPanel
            user={user}
            bereavementCase={bereavementCase}
            procedures={procedures}
            professionals={professionals}
            members={members}
            reminderLogs={reminderLogs}
            canCollaborate={canCollaborate}
            userName={userName}
            activeSubTab={toolsSubTab}
            onSubTabChange={setToolsSubTab}
          />
        )}
      </main>

      <div className="hidden md:block">
        <LegalDisclaimerFooter variant="light" />
      </div>

      {/* Mobile Fixed Bottom Thumb-Zone Navigation (compact h-16 <= 15% mobile height) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E7E2D8] pb-safe">
        <div className="grid grid-cols-6 items-center h-16">
          {navTabs.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`flex flex-col items-center justify-center h-full px-1 ${
                  active ? 'text-[#8F754B]' : 'text-[#666A73]'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium mt-1 truncate max-w-full">
                  {t.shortLabel}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Procedure Detail Modal / Sheet */}
      {selectedProc && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:p-4">
          <div className="w-full max-w-2xl rounded-t-3xl sm:rounded-2xl bg-white border border-[#E7E2D8] max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="px-5 py-4 border-b border-[#E7E2D8] flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-[#7D633A] font-mono-num">
                  {selectedProc.effectiveDeadlineDate
                    ? `Fecha límite: ${formatDateES(selectedProc.effectiveDeadlineDate)} · ${
                        selectedProc.deadlineKind === 'legal' ? 'Plazo legal' : 'Fecha orientativa'
                      }`
                    : 'Sin fecha límite fija'}
                </p>
                <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#141518] mt-1">
                  {selectedProc.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProcId(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[#5E626A] hover:bg-[#F5F1EA]"
                aria-label="Cerrar ficha"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
              {/* Action Controls: Done + Assignee */}
              <div className="rounded-xl bg-[#FAF8F5] border border-[#E7E2D8] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => void handleToggleTaskDone(selectedProc)}
                  disabled={!canCollaborate}
                  className={`min-h-[44px] px-4 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors ${
                    bereavementCase.taskStates[selectedProc.id]?.done
                      ? 'bg-[#2C6B4B] text-white'
                      : 'bg-[#141518] text-[#F6F4EF] hover:bg-[#25272D]'
                  } disabled:opacity-50`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {bereavementCase.taskStates[selectedProc.id]?.done
                      ? 'Marcado como hecho'
                      : 'Marcar como hecho'}
                  </span>
                </button>

                <div className="flex items-center gap-2">
                  <label htmlFor="assigneeSelect" className="text-xs text-[#5B5E65] whitespace-nowrap">
                    ¿Quién se encarga?
                  </label>
                  <select
                    id="assigneeSelect"
                    value={bereavementCase.taskStates[selectedProc.id]?.assigneeUid || ''}
                    onChange={(e) => void handleAssignMember(selectedProc, e.target.value)}
                    disabled={!canCollaborate}
                    className="min-h-[40px] rounded-xl border border-[#D8D0C2] bg-white px-3 text-xs font-medium"
                  >
                    <option value="">Sin asignar</option>
                    {members.map((m) => (
                      <option key={m.uid} value={m.uid}>
                        {m.displayName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedProc.regionalNote && (
                <div className="rounded-xl border border-[#CBBCA2] bg-[#F7F2E8] p-4">
                  <p className="text-xs font-semibold text-[#6B532E]">
                    Nota para {bereavementCase.ccaa}
                  </p>
                  <p className="mt-1 text-sm text-[#3F311C] leading-relaxed">
                    {selectedProc.regionalNote}
                  </p>
                </div>
              )}

              <div>
                <h3 className="text-sm font-semibold text-[#141518]">Qué es</h3>
                <p className="mt-1.5 text-sm text-[#45484F] leading-relaxed">
                  {selectedProc.whatIsIt}
                </p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-[#141518]">Dónde se hace</h3>
                <p className="mt-1.5 text-sm text-[#45484F] leading-relaxed">
                  {selectedProc.effectiveWhereToDoIt}
                </p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-[#141518]">Qué documentos necesitas</h3>
                <ul className="mt-2 space-y-1.5">
                  {selectedProc.effectiveRequiredDocs.map((docLabel) => {
                    const key = normalizeDocKey(docLabel);
                    const hasIt = Boolean(bereavementCase.docStates[key]?.gathered);
                    return (
                      <li
                        key={docLabel}
                        className="flex items-center gap-2 text-sm text-[#45484F]"
                      >
                        <span
                          className={`w-4 h-4 rounded flex items-center justify-center text-[10px] shrink-0 ${
                            hasIt
                              ? 'bg-[#2C6B4B] text-white'
                              : 'border border-[#C9C0B1] text-transparent'
                          }`}
                        >
                          ✓
                        </span>
                        <span className={hasIt ? 'text-[#2C6B4B] font-medium' : ''}>
                          {docLabel} {hasIt ? '(ya lo tenéis)' : ''}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-[#141518]">Qué pasa si no se hace</h3>
                <p className="mt-1.5 text-sm text-[#45484F] leading-relaxed">
                  {selectedProc.consequencesIfSkipped}
                </p>
              </div>

              {/* Shared Family Notes for this Procedure */}
              <div className="pt-4 border-t border-[#E7E2D8] space-y-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-[#8F754B]" />
                  <h3 className="text-sm font-semibold text-[#141518]">
                    Notas compartidas de la familia
                  </h3>
                </div>

                {canCollaborate && (
                  <form
                    onSubmit={(e) => void handleAddNote(e, selectedProc.id)}
                    className="flex gap-2"
                  >
                    <input
                      type="text"
                      value={newNoteText}
                      onChange={(e) => setNewNoteText(e.target.value)}
                      placeholder="Añade un número de expediente, llamada o recordatorio..."
                      className="flex-1 min-h-[44px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] px-3.5 text-sm"
                    />
                    <button
                      type="submit"
                      disabled={noteBusy || !newNoteText.trim()}
                      className="min-h-[44px] px-4 rounded-xl bg-[#141518] text-[#F6F4EF] text-xs font-semibold disabled:opacity-50"
                    >
                      Guardar
                    </button>
                  </form>
                )}

                <div className="space-y-2">
                  {notes
                    .filter((n) => n.procedureId === selectedProc.id)
                    .map((n) => (
                      <div
                        key={n.id}
                        className="rounded-xl border border-[#EFECE5] bg-[#FAF8F5] p-3 flex items-start justify-between gap-3"
                      >
                        <div>
                          <p className="text-sm text-[#1C1E22]">{n.text}</p>
                          <p className="text-[11px] text-[#7A7D85] mt-1">
                            {n.authorName} · {new Date(n.createdAt).toLocaleDateString('es-ES')}
                          </p>
                        </div>
                        {(isOwner || n.authorUid === user.uid) && (
                          <button
                            type="button"
                            onClick={() => void deleteCaseNote(bereavementCase.id, n.id)}
                            className="p-1.5 text-[#7A7D85] hover:text-red-700"
                            aria-label="Borrar nota"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  {notes.filter((n) => n.procedureId === selectedProc.id).length === 0 && (
                    <p className="text-xs text-[#7A7D85]">
                      Aún no hay notas en este trámite.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showUnlockModal && (
        <UnlockCaseModal
          bereavementCase={bereavementCase}
          onClose={() => setShowUnlockModal(false)}
          onUnlocked={(msg) => {
            setShowUnlockModal(false);
            showToast(msg);
          }}
        />
      )}

      <LegalFaqDrawer
        open={faqOpen}
        onClose={() => setFaqOpen(false)}
        activeCase={bereavementCase}
        onOpenProcedure={(procId) => {
          const match = procedures.find((p) => p.id === procId);
          if (match && !match.isLockedByPlan) {
            setSelectedProcId(match.id);
          } else if (match && match.isLockedByPlan) {
            setShowUnlockModal(true);
          } else {
            setActiveTab('tramites');
          }
        }}
      />
    </div>
  );
};
