import React, { useEffect, useState } from 'react';
import {
  Bell,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Mail,
  MessageSquare,
  Phone,
  Send,
  X,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { auth } from '../firebase';
import { COMUNIDADES_AUTONOMAS } from '../data/proceduresCatalog';
import {
  saveCaseReminderLog,
  updateCaseDetailsAndAnswers,
} from '../services/firestoreService';
import {
  fetchCaseReminderStatus,
  runCaseReminderNow,
  syncCaseRemindersWithServer,
  type ReminderStatusResponse,
  type ServerReminderRecord,
} from '../services/remindersClient';
import type {
  BereavementCase,
  CaseMember,
  CaseReminderLog,
  PersonalizedProcedure,
  ProfessionalEntry,
} from '../types/domain';
import { daysSinceDate, formatDateES, summarizeAnswersES } from '../utils/caseEngine';
import { buildCommunicationTemplates } from '../utils/communicationTemplates';

interface CaseToolsPanelProps {
  user: User;
  bereavementCase: BereavementCase;
  procedures: PersonalizedProcedure[];
  professionals: ProfessionalEntry[];
  members: CaseMember[];
  reminderLogs: CaseReminderLog[];
  canCollaborate: boolean;
  userName: string;
  activeSubTab?: 'assistant' | 'templates' | 'directory' | 'reminders';
  onSubTabChange?: (tab: 'assistant' | 'templates' | 'directory' | 'reminders') => void;
}

export const CaseToolsPanel: React.FC<CaseToolsPanelProps> = ({
  user,
  bereavementCase,
  procedures,
  professionals,
  members,
  reminderLogs,
  canCollaborate,
  userName,
  activeSubTab,
  onSubTabChange,
}) => {
  const [internalSubTab, setInternalSubTab] = useState<
    'assistant' | 'templates' | 'directory' | 'reminders'
  >('assistant');
  const subTab = activeSubTab ?? internalSubTab;
  const setSubTab = (next: 'assistant' | 'templates' | 'directory' | 'reminders') => {
    setInternalSubTab(next);
    if (onSubTabChange) onSubTabChange(next);
  };

  // Assistant state
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'model'; text: string }>>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Templates state
  const templates = buildCommunicationTemplates(bereavementCase, userName);
  const [selectedTplId, setSelectedTplId] = useState(templates[0]?.id || 'banco-saldos');
  const currentTpl = templates.find((t) => t.id === selectedTplId) || templates[0];
  const [editedBodies, setEditedBodies] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Directory state
  const [dirCategory, setDirCategory] = useState('Todas');
  const [dirCcaa, setDirCcaa] = useState('Todas');
  const [dirSearch, setDirSearch] = useState('');

  // Reminders state
  const [remEmail, setRemEmail] = useState(
    bereavementCase.reminderEmail || bereavementCase.ownerEmail
  );
  const [remEnabled, setRemEnabled] = useState(bereavementCase.reminderEnabled ?? true);
  const [remDays, setRemDays] = useState(bereavementCase.reminderDaysBefore ?? 7);
  const [remOnlyLegal, setRemOnlyLegal] = useState(bereavementCase.reminderOnlyLegal ?? false);
  const [remStatus, setRemStatus] = useState<string | null>(null);
  const [remError, setRemError] = useState<string | null>(null);
  const [remBusy, setRemBusy] = useState(false);
  const [remMailto, setRemMailto] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<ReminderStatusResponse | null>(null);
  const [previewRecord, setPreviewRecord] = useState<{
    subject: string;
    recipientEmail: string;
    textPreview: string;
    status: string;
  } | null>(null);

  useEffect(() => {
    setRemEmail(bereavementCase.reminderEmail || bereavementCase.ownerEmail);
    setRemEnabled(bereavementCase.reminderEnabled ?? true);
    setRemDays(bereavementCase.reminderDaysBefore ?? 7);
    setRemOnlyLegal(bereavementCase.reminderOnlyLegal ?? false);
  }, [
    bereavementCase.id,
    bereavementCase.reminderEmail,
    bereavementCase.ownerEmail,
    bereavementCase.reminderEnabled,
    bereavementCase.reminderDaysBefore,
    bereavementCase.reminderOnlyLegal,
  ]);

  const refreshServerReminderStatus = async () => {
    try {
      const status = await fetchCaseReminderStatus(bereavementCase.id);
      setServerStatus(status);
    } catch {
      // Offline or not yet synced
    }
  };

  useEffect(() => {
    if (subTab === 'reminders') {
      void refreshServerReminderStatus();
    }
  }, [subTab, bereavementCase.id, bereavementCase.updatedAt]);

  const askAssistant = async (promptText: string) => {
    const clean = promptText.trim();
    if (!clean) return;
    setAiError(null);
    const nextHistory = [...messages, { role: 'user' as const, text: clean }];
    setMessages(nextHistory);
    setQuestion('');
    setAiBusy(true);

    try {
      const token = await auth.currentUser?.getIdToken();
      const resp = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || ''}`,
        },
        body: JSON.stringify({
          question: clean,
          history: messages,
          caseContext: {
            ccaa: bereavementCase.ccaa,
            deathDate: bereavementCase.deathDate,
            daysSinceDeath: daysSinceDate(bereavementCase.deathDate),
            answersSummary: summarizeAnswersES(bereavementCase.answers),
          },
          catalogProcedures: procedures.map((p) => ({
            title: p.title,
            summary: p.summary,
            whatIsIt: p.whatIsIt,
            whereToDoIt: p.effectiveWhereToDoIt,
            deadlineText: p.effectiveDeadlineDate
              ? `${formatDateES(p.effectiveDeadlineDate)} (${p.deadlineKind === 'legal' ? 'Plazo legal' : 'Fecha orientativa'})`
              : 'Sin fecha fija',
            regionalNote: p.regionalNote,
            requiredDocs: p.effectiveRequiredDocs,
          })),
        }),
      });
      const data = (await resp.json()) as { answer?: string; error?: string };
      if (!resp.ok || !data.answer) {
        throw new Error(data.error || 'No se pudo obtener respuesta.');
      }
      setMessages([...nextHistory, { role: 'model', text: data.answer }]);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Error al consultar al asistente.');
    } finally {
      setAiBusy(false);
    }
  };

  const categories = ['Todas', ...Array.from(new Set(professionals.map((p) => p.category)))];
  const filteredPros = professionals.filter((entry) => {
    const okCat = dirCategory === 'Todas' || entry.category === dirCategory;
    const okCcaa =
      dirCcaa === 'Todas' || entry.ccaa === 'Todas' || entry.ccaa === dirCcaa;
    const okQ =
      !dirSearch.trim() ||
      entry.name.toLowerCase().includes(dirSearch.toLowerCase()) ||
      entry.description.toLowerCase().includes(dirSearch.toLowerCase());
    return okCat && okCcaa && okQ;
  });

  const handleSaveReminders = async (e: React.FormEvent) => {
    e.preventDefault();
    setRemBusy(true);
    setRemStatus(null);
    setRemError(null);
    setRemMailto(null);
    const cleanEmail = remEmail.trim();
    try {
      await updateCaseDetailsAndAnswers(bereavementCase.id, {
        reminderEmail: cleanEmail,
        reminderEnabled: remEnabled,
        reminderDaysBefore: remDays,
        reminderOnlyLegal: remOnlyLegal,
      });

      const updatedCase: BereavementCase = {
        ...bereavementCase,
        reminderEmail: cleanEmail,
        reminderEnabled: remEnabled,
        reminderDaysBefore: remDays,
        reminderOnlyLegal: remOnlyLegal,
      };
      const syncRes = await syncCaseRemindersWithServer(updatedCase, procedures, {
        runAutoCheck: remEnabled,
        recipientName: userName,
      });

      if (syncRes.autoDispatchedRecord) {
        await saveCaseReminderLog(bereavementCase.id, user, syncRes.autoDispatchedRecord).catch(
          () => {}
        );
      }

      await refreshServerReminderStatus();

      if (syncRes.autoDispatchedRecord?.status === 'sent') {
        setRemStatus(
          `Configuración guardada y enviado un aviso automático a ${cleanEmail} porque hay plazos dentro de los próximos ${remDays} días.`
        );
      } else if (syncRes.autoDispatchedRecord?.status === 'error') {
        setRemError(
          syncRes.autoDispatchedRecord.errorMessage ||
            'Configuración guardada, pero hubo un error al enviar el correo.'
        );
      } else if (remEnabled) {
        setRemStatus(
          `Preferencias guardadas. Revisaremos tus plazos automáticamente cada día y avisaremos a ${cleanEmail} ${remDays} días antes.`
        );
      } else {
        setRemStatus('Preferencias guardadas. Los avisos automáticos han quedado pausados.');
      }
    } catch (err) {
      setRemError(err instanceof Error ? err.message : 'No se pudo guardar la configuración.');
    } finally {
      setRemBusy(false);
    }
  };

  const handleDispatchNow = async (mode: 'manual_summary' | 'test') => {
    setRemBusy(true);
    setRemStatus(null);
    setRemError(null);
    setRemMailto(null);
    const cleanEmail = remEmail.trim();
    try {
      const updatedCase: BereavementCase = {
        ...bereavementCase,
        reminderEmail: cleanEmail,
        reminderEnabled: remEnabled,
        reminderDaysBefore: remDays,
        reminderOnlyLegal: remOnlyLegal,
      };
      await syncCaseRemindersWithServer(updatedCase, procedures, {
        runAutoCheck: false,
        recipientName: userName,
      });

      const res = await runCaseReminderNow({
        caseId: bereavementCase.id,
        mode,
        overrideEmail: cleanEmail,
      });

      if (res.record) {
        if (canCollaborate) {
          await saveCaseReminderLog(bereavementCase.id, user, res.record).catch(() => {});
        }
        await refreshServerReminderStatus();

        const providerLabel =
          res.emailProvider === 'gmail'
            ? 'Gmail'
            : res.emailProvider === 'resend'
            ? 'Resend'
            : 'el servidor';

        if (res.record.status === 'sent') {
          setRemStatus(
            mode === 'test'
              ? `Correo de prueba enviado correctamente a ${cleanEmail} mediante ${providerLabel}.`
              : `Resumen de próximos plazos enviado correctamente a ${cleanEmail} mediante ${providerLabel}.`
          );
          setPreviewRecord({
            subject: res.record.subject,
            recipientEmail: res.record.recipientEmail,
            textPreview: res.record.textPreview,
            status: res.record.status,
          });
        } else if (res.record.status === 'error') {
          setRemError(
            res.record.errorMessage ||
              'No se pudo entregar el correo. Revisa las credenciales o la dirección de destino.'
          );
          if (res.mailtoHref) setRemMailto(res.mailtoHref);
          setPreviewRecord({
            subject: res.record.subject,
            recipientEmail: res.record.recipientEmail,
            textPreview: res.record.textPreview,
            status: res.record.status,
          });
        } else {
          setRemStatus(
            `Correo cálido preparado para ${cleanEmail}. El envío automático directo se activará en cuanto configures Gmail (GMAIL_USER y GMAIL_APP_PASSWORD) o Resend en el servidor; mientras tanto, puedes previsualizarlo o abrirlo en tu correo.`
          );
          if (res.mailtoHref) setRemMailto(res.mailtoHref);
          setPreviewRecord({
            subject: res.record.subject,
            recipientEmail: res.record.recipientEmail,
            textPreview: res.record.textPreview,
            status: res.record.status,
          });
        }
      }
    } catch (err) {
      setRemError(err instanceof Error ? err.message : 'No se pudo enviar el recordatorio.');
    } finally {
      setRemBusy(false);
    }
  };

  // Merge Firestore reminder logs and server history so text previews and cross-device logs are unified
  const serverHistoryMap = new Map<string, ServerReminderRecord>();
  for (const h of serverStatus?.history || []) {
    serverHistoryMap.set(h.id, h);
  }
  const mergedHistoryMap = new Map<
    string,
    {
      id: string;
      recipientEmail: string;
      triggerType: 'auto' | 'manual_summary' | 'test';
      status: 'sent' | 'simulated_no_api_key' | 'error';
      subject: string;
      procedureTitles: string[];
      errorMessage?: string;
      createdAt: string;
      textPreview?: string;
    }
  >();

  for (const log of reminderLogs) {
    const serverMatch = serverHistoryMap.get(log.id);
    mergedHistoryMap.set(log.id, {
      ...log,
      textPreview: serverMatch?.textPreview,
    });
  }
  for (const h of serverStatus?.history || []) {
    if (!mergedHistoryMap.has(h.id)) {
      mergedHistoryMap.set(h.id, {
        id: h.id,
        recipientEmail: h.recipientEmail,
        triggerType: h.triggerType,
        status: h.status,
        subject: h.subject,
        procedureTitles: h.procedureTitles,
        errorMessage: h.errorMessage,
        createdAt: h.createdAt,
        textPreview: h.textPreview,
      });
    }
  }
  const combinedHistory = Array.from(mergedHistoryMap.values()).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );

  const memberEmails = Array.from(
    new Set(
      [bereavementCase.ownerEmail, ...members.map((m) => m.email)]
        .map((e) => e.trim())
        .filter(Boolean)
    )
  );

  const activeBody = currentTpl ? editedBodies[currentTpl.id] ?? currentTpl.body : '';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1.5 p-1.5 rounded-xl bg-[#EFECE5] border border-[#E2DDD3]">
        {(
          [
            { id: 'assistant', label: 'Asistente de dudas', icon: MessageSquare },
            { id: 'templates', label: 'Modelos de escritos', icon: Mail },
            { id: 'directory', label: 'Directorio', icon: BookOpen },
            { id: 'reminders', label: 'Avisos por correo', icon: Bell },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-white text-[#141518] shadow-sm'
                  : 'text-[#5B5E65] hover:text-[#141518]'
              }`}
            >
              <Icon className="w-4 h-4 text-[#8F754B]" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 1. AI Assistant */}
      {subTab === 'assistant' && (
        <div className="rounded-2xl bg-white border border-[#E7E2D8] p-5 sm:p-6 space-y-5">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#141518]">
              Asistente de dudas prácticas
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-[#5B5E65]">
              Responde en lenguaje sencillo usando únicamente el contenido revisado de «Después del
              adiós» y los datos de este caso ({bereavementCase.ccaa}). No ofrece asesoramiento
              jurídico.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              '¿Qué debo hacer esta primera semana?',
              '¿Cómo funciona la prórroga del Impuesto de Sucesiones?',
              '¿Qué pasa si no sabemos si hay testamento?',
            ].map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => void askAssistant(q)}
                disabled={aiBusy}
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[#DDD5C7] bg-[#FAF8F5] text-xs font-medium text-[#2A2C30] hover:bg-[#F1ECE2] text-left"
              >
                {q}
              </button>
            ))}
          </div>

          {messages.length > 0 && (
            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`rounded-xl p-4 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-[#141518] text-[#F6F4EF] ml-6 sm:ml-12'
                      : 'bg-[#F7F4EE] border border-[#E5DFD3] text-[#1C1E22] mr-4 sm:mr-10'
                  }`}
                >
                  {m.text}
                </div>
              ))}
            </div>
          )}

          {aiError && (
            <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
              {aiError}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void askAssistant(question);
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Escribe tu duda sobre algún trámite o plazo..."
              className="flex-1 min-h-[48px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] px-4 text-sm focus:outline-none focus:border-[#8F754B]"
            />
            <button
              type="submit"
              disabled={aiBusy || !question.trim()}
              className="min-h-[48px] px-5 rounded-xl bg-[#141518] text-[#F6F4EF] text-sm font-semibold hover:bg-[#25272D] inline-flex items-center gap-2 disabled:opacity-50 shrink-0"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">{aiBusy ? 'Pensando...' : 'Preguntar'}</span>
            </button>
          </form>
        </div>
      )}

      {/* 2. Communication Templates */}
      {subTab === 'templates' && currentTpl && (
        <div className="grid lg:grid-cols-12 gap-5">
          <div className="lg:col-span-5 space-y-2">
            {templates.map((tpl) => {
              const active = tpl.id === currentTpl.id;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => setSelectedTplId(tpl.id)}
                  className={`w-full text-left rounded-xl border p-4 transition-colors ${
                    active
                      ? 'bg-[#141518] text-[#F6F4EF] border-[#141518]'
                      : 'bg-white text-[#1C1E22] border-[#E7E2D8] hover:bg-[#F5F1EA]'
                  }`}
                >
                  <p className="text-sm font-semibold">{tpl.title}</p>
                  <p className={`text-xs mt-1 ${active ? 'text-[#CFC9BE]' : 'text-[#666A73]'}`}>
                    {tpl.recipientHint}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="lg:col-span-7 rounded-2xl bg-white border border-[#E7E2D8] p-5 space-y-4">
            <div>
              <p className="text-xs text-[#6E6A63]">Rellenado automáticamente con los datos de este caso</p>
              <h3 className="font-display text-2xl font-semibold text-[#141518] mt-1">
                {currentTpl.title}
              </h3>
              <p className="text-xs text-[#5B5E65] mt-1">
                Asunto sugerido: <strong>{currentTpl.subject}</strong>
              </p>
            </div>

            <textarea
              rows={13}
              value={activeBody}
              onChange={(e) =>
                setEditedBodies((prev) => ({ ...prev, [currentTpl.id]: e.target.value }))
              }
              className="w-full rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] p-4 text-sm text-[#1C1E22] leading-relaxed focus:outline-none focus:border-[#8F754B]"
            />

            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(`${currentTpl.subject}\n\n${activeBody}`);
                  setCopiedId(currentTpl.id);
                  setTimeout(() => setCopiedId(null), 2000);
                }}
                className="min-h-[44px] px-4 rounded-xl bg-[#141518] text-[#F6F4EF] text-xs sm:text-sm font-medium inline-flex items-center gap-2"
              >
                <Copy className="w-4 h-4 text-[#D6C3A5]" />
                <span>{copiedId === currentTpl.id ? 'Copiado' : 'Copiar texto'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const blob = new Blob([`${currentTpl.subject}\n\n${activeBody}`], {
                    type: 'text/plain;charset=utf-8',
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${currentTpl.id}.txt`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="min-h-[44px] px-4 rounded-xl border border-[#D8D0C2] bg-white text-xs sm:text-sm font-medium text-[#1C1E22] hover:bg-[#F5F1EA] inline-flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Descargar .txt</span>
              </button>

              <a
                href={`mailto:?subject=${encodeURIComponent(currentTpl.subject)}&body=${encodeURIComponent(activeBody)}`}
                className="min-h-[44px] px-4 rounded-xl border border-[#D8D0C2] bg-white text-xs sm:text-sm font-medium text-[#1C1E22] hover:bg-[#F5F1EA] inline-flex items-center gap-2"
              >
                <Mail className="w-4 h-4" />
                <span>Abrir en correo</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* 3. Directory */}
      {subTab === 'directory' && (
        <div className="space-y-5">
          <div className="rounded-2xl bg-white border border-[#E7E2D8] p-5 grid sm:grid-cols-3 gap-3">
            <input
              type="text"
              value={dirSearch}
              onChange={(e) => setDirSearch(e.target.value)}
              placeholder="Buscar organismo o profesional..."
              className="min-h-[44px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] px-3.5 text-sm"
            />
            <select
              value={dirCategory}
              onChange={(e) => setDirCategory(e.target.value)}
              className="min-h-[44px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] px-3.5 text-sm"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === 'Todas' ? 'Todas las especialidades' : cat}
                </option>
              ))}
            </select>
            <select
              value={dirCcaa}
              onChange={(e) => setDirCcaa(e.target.value)}
              className="min-h-[44px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] px-3.5 text-sm"
            >
              <option value="Todas">Toda España</option>
              {COMUNIDADES_AUTONOMAS.map((ca) => (
                <option key={ca} value={ca}>
                  {ca}
                </option>
              ))}
            </select>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {filteredPros.map((entry) => (
              <div
                key={entry.id}
                className="rounded-2xl bg-white border border-[#E7E2D8] p-5 flex flex-col justify-between gap-4"
              >
                <div>
                  <p className="text-xs text-[#7D633A]">
                    {entry.category} · {entry.ccaa === 'Todas' ? 'Toda España' : entry.ccaa}
                    {entry.isPublicService ? ' · Servicio público / gratuito' : ''}
                  </p>
                  <h3 className="mt-1.5 text-base font-semibold text-[#141518]">{entry.name}</h3>
                  <p className="mt-2 text-sm text-[#5B5E65] leading-relaxed">{entry.description}</p>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[#EFECE5] text-xs font-medium">
                  {entry.phone && (
                    <a
                      href={`tel:${entry.phone.replace(/\s+/g, '')}`}
                      className="inline-flex items-center gap-1.5 text-[#141518] hover:underline font-mono-num"
                    >
                      <Phone className="w-3.5 h-3.5 text-[#8F754B]" />
                      {entry.phone}
                    </a>
                  )}
                  {entry.website && (
                    <a
                      href={entry.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[#7D633A] hover:underline"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Visitar web oficial
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Automated Email Reminders (Resend) */}
      {subTab === 'reminders' && (
        <div className="grid lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 space-y-5">
            <div className="rounded-2xl bg-white border border-[#E7E2D8] p-5 sm:p-6 space-y-5">
              <div>
                <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#141518]">
                  Recordatorios automáticos de plazos
                </h2>
                <p className="mt-1.5 text-sm text-[#5B5E65] leading-relaxed">
                  Para que no tengas que estar pendiente del calendario, te enviamos un correo
                  tranquilo y claro antes de que venza cada trámite importante. En cuanto marques un
                  trámite como hecho, dejamos de avisarte sobre él.
                </p>
              </div>

              {serverStatus && !serverStatus.resendConfigured && (
                <div className="rounded-xl border border-[#D6C3A5] bg-[#FAF8F5] px-4 py-3 text-xs sm:text-sm text-[#4F3D22] leading-relaxed">
                  <strong>Envío automático en modo preparación:</strong> aún no hay un servicio de
                  correo activo en el servidor (Gmail o Resend), así que los avisos se preparan con
                  su formato cálido completo para que puedas previsualizarlos o enviarlos desde tu
                  gestor de correo.
                </div>
              )}

              {serverStatus && serverStatus.resendConfigured && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-xs sm:text-sm text-emerald-950 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <span>
                    Envío automático por correo activo a través de{' '}
                    {serverStatus.emailProvider === 'gmail' ? 'Gmail' : 'Resend'} (remitente:{' '}
                    <span className="font-mono-num">{serverStatus.fromAddress}</span>).
                  </span>
                </div>
              )}

              <form onSubmit={handleSaveReminders} className="space-y-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={remEnabled}
                    onChange={(e) => setRemEnabled(e.target.checked)}
                    disabled={!canCollaborate}
                    className="w-5 h-5 mt-0.5 accent-[#8F754B]"
                  />
                  <span className="text-sm font-medium text-[#1C1E22]">
                    Activar avisos automáticos antes de que venzan los plazos pendientes
                  </span>
                </label>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="remEmailInput"
                      className="block text-xs font-medium text-[#45484F] mb-1"
                    >
                      Correo donde recibir los avisos
                    </label>
                    <input
                      id="remEmailInput"
                      type="email"
                      required
                      value={remEmail}
                      onChange={(e) => setRemEmail(e.target.value)}
                      disabled={!canCollaborate}
                      placeholder="tu@correo.es"
                      className="w-full min-h-[44px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] px-3.5 text-sm"
                    />
                    {memberEmails.length > 1 && canCollaborate && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {memberEmails.map((em) => (
                          <button
                            key={em}
                            type="button"
                            onClick={() => setRemEmail(em)}
                            className={`px-2.5 py-1 rounded-lg border text-[11px] transition-colors ${
                              remEmail.trim().toLowerCase() === em.toLowerCase()
                                ? 'border-[#8F754B] bg-[#F7F2E8] text-[#4F3D22] font-medium'
                                : 'border-[#E2DDD3] bg-white text-[#5B5E65] hover:bg-[#FAF8F5]'
                            }`}
                          >
                            {em}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="remDaysSelect"
                      className="block text-xs font-medium text-[#45484F] mb-1"
                    >
                      Con cuánta antelación avisar
                    </label>
                    <select
                      id="remDaysSelect"
                      value={remDays}
                      onChange={(e) => setRemDays(Number(e.target.value))}
                      disabled={!canCollaborate}
                      className="w-full min-h-[44px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] px-3.5 text-sm"
                    >
                      <option value={3}>3 días antes</option>
                      <option value={7}>7 días antes</option>
                      <option value={14}>14 días antes</option>
                      <option value={30}>30 días antes</option>
                    </select>
                  </div>
                </div>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={remOnlyLegal}
                    onChange={(e) => setRemOnlyLegal(e.target.checked)}
                    disabled={!canCollaborate}
                    className="w-4 h-4 mt-0.5 accent-[#8F754B]"
                  />
                  <span className="text-xs sm:text-sm text-[#45484F]">
                    Avisarme solo en <strong>plazos legales</strong> (y no en fechas orientativas)
                  </span>
                </label>

                <div className="flex flex-wrap gap-2.5 pt-1">
                  {canCollaborate && (
                    <button
                      type="submit"
                      disabled={remBusy}
                      className="min-h-[44px] px-5 rounded-xl bg-[#141518] text-[#F6F4EF] text-sm font-medium hover:bg-[#25272D] disabled:opacity-60"
                    >
                      {remBusy ? 'Guardando...' : 'Guardar configuración'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleDispatchNow('manual_summary')}
                    disabled={remBusy || !remEmail.trim()}
                    className="min-h-[44px] px-4 rounded-xl border border-[#8F754B] text-[#7D633A] text-sm font-medium hover:bg-[#F5F0E6] disabled:opacity-60"
                  >
                    Enviar resumen ahora
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDispatchNow('test')}
                    disabled={remBusy || !remEmail.trim()}
                    className="min-h-[44px] px-4 rounded-xl border border-[#D8D0C2] bg-white text-[#45484F] text-sm font-medium hover:bg-[#FAF8F5] disabled:opacity-60"
                  >
                    Enviar correo de prueba
                  </button>
                </div>
              </form>

              {remError && (
                <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 space-y-2">
                  <p>{remError}</p>
                  {remMailto && (
                    <a
                      href={remMailto}
                      className="inline-flex items-center gap-1.5 font-semibold underline text-red-950"
                    >
                      <Mail className="w-4 h-4" /> Abrir en tu gestor de correo
                    </a>
                  )}
                </div>
              )}

              {remStatus && (
                <div className="rounded-xl border border-[#D6C3A5] bg-[#F7F2E8] p-4 text-sm text-[#4F3D22] space-y-2">
                  <p>{remStatus}</p>
                  <div className="flex flex-wrap gap-4">
                    {remMailto && (
                      <a
                        href={remMailto}
                        className="inline-flex items-center gap-1.5 font-semibold underline text-[#141518]"
                      >
                        <Mail className="w-4 h-4" /> Abrir correo listo para enviar
                      </a>
                    )}
                    {previewRecord && (
                      <button
                        type="button"
                        onClick={() => setPreviewRecord({ ...previewRecord })}
                        className="inline-flex items-center gap-1.5 font-semibold underline text-[#7D633A]"
                      >
                        <Eye className="w-4 h-4" /> Ver texto completo del correo
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Upcoming Automated Triggers */}
            <div className="rounded-2xl bg-white border border-[#E7E2D8] p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-[#8F754B]" />
                <h3 className="text-base font-semibold text-[#141518]">
                  Próximos avisos programados
                </h3>
              </div>

              {!remEnabled ? (
                <p className="text-xs sm:text-sm text-[#666A73]">
                  Los avisos automáticos están pausados. Activa la casilla superior para programar
                  recordatorios antes de cada vencimiento.
                </p>
              ) : (serverStatus?.upcomingTriggers || []).length === 0 ? (
                <p className="text-xs sm:text-sm text-[#666A73]">
                  No hay trámites pendientes con fecha próxima para avisar según tus preferencias
                  actuales.
                </p>
              ) : (
                <div className="divide-y divide-[#EFECE5]">
                  {(serverStatus?.upcomingTriggers || []).slice(0, 8).map((item) => (
                    <div
                      key={item.procedureId}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#141518] truncate">{item.title}</p>
                        <p className="text-xs text-[#666A73] font-mono-num mt-0.5">
                          Límite: {formatDateES(item.effectiveDeadlineDate)} ·{' '}
                          {item.deadlineKind === 'legal' ? 'Plazo legal' : 'Orientativo'}
                        </p>
                      </div>
                      <div className="text-xs text-[#5B5E65] sm:text-right shrink-0 font-mono-num">
                        {item.advanceSentAt ? (
                          <span className="text-[#2C6B4B] font-medium">
                            Aviso previo enviado
                          </span>
                        ) : item.plannedNoticeDate ? (
                          <span>Aviso: {formatDateES(item.plannedNoticeDate)}</span>
                        ) : (
                          <span>Próximo</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Sent & Prepared History */}
          <div className="lg:col-span-5 rounded-2xl bg-white border border-[#E7E2D8] p-5 sm:p-6 space-y-4">
            <div>
              <h3 className="text-base font-semibold text-[#141518]">Historial de avisos</h3>
              <p className="text-xs text-[#666A73] mt-0.5">
                Registro de correos automáticos, resúmenes y pruebas del caso.
              </p>
            </div>

            {combinedHistory.length === 0 ? (
              <div className="rounded-xl border border-[#EFECE5] bg-[#FAF8F5] p-4 text-xs sm:text-sm text-[#666A73]">
                Todavía no se ha enviado ni preparado ningún recordatorio en este caso. Puedes usar
                «Enviar correo de prueba» para comprobar el formato.
              </div>
            ) : (
              <div className="divide-y divide-[#EFECE5]">
                {combinedHistory.slice(0, 12).map((entry) => {
                  const statusLabel =
                    entry.status === 'sent'
                      ? 'Enviado'
                      : entry.status === 'error'
                      ? 'Error al enviar'
                      : 'Preparado';
                  const typeLabel =
                    entry.triggerType === 'auto'
                      ? 'Automático'
                      : entry.triggerType === 'test'
                      ? 'Prueba'
                      : 'Resumen';
                  return (
                    <div key={entry.id} className="py-3 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs sm:text-sm font-medium text-[#141518] leading-snug">
                          {entry.subject}
                        </p>
                        {entry.textPreview && (
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewRecord({
                                subject: entry.subject,
                                recipientEmail: entry.recipientEmail,
                                textPreview: entry.textPreview || '',
                                status: entry.status,
                              })
                            }
                            className="text-xs font-medium text-[#7D633A] hover:underline shrink-0"
                          >
                            Ver
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-[#666A73] font-mono-num">
                        {statusLabel} · {typeLabel} · {entry.recipientEmail} ·{' '}
                        {new Date(entry.createdAt).toLocaleDateString('es-ES')}
                      </p>
                      {entry.errorMessage && (
                        <p className="text-[11px] text-red-700">{entry.errorMessage}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Email Preview Modal */}
      {previewRecord && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:p-4">
          <div className="w-full max-w-2xl rounded-t-3xl sm:rounded-2xl bg-white border border-[#E7E2D8] max-h-[88vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="px-5 py-4 border-b border-[#E7E2D8] flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-[#7D633A]">
                  Para: {previewRecord.recipientEmail}
                </p>
                <h3 className="font-display text-xl sm:text-2xl font-semibold text-[#141518] mt-0.5">
                  {previewRecord.subject}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewRecord(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[#5E626A] hover:bg-[#F5F1EA]"
                aria-label="Cerrar vista previa"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 sm:p-6 overflow-y-auto bg-[#FAF8F5]">
              <div className="rounded-xl bg-white border border-[#E7E2D8] p-5 text-sm text-[#1C1E22] leading-relaxed whitespace-pre-wrap">
                {previewRecord.textPreview}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
