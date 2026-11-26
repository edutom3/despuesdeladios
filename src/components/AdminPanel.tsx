import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  BookOpen,
  Check,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  KeyRound,
  Plus,
  Search,
  Shield,
  Users,
} from 'lucide-react';
import { COMUNIDADES_AUTONOMAS } from '../data/proceduresCatalog';
import {
  fetchAllCasesAdmin,
  fetchAllInvitationsAdmin,
  fetchAllUsersAdmin,
  fetchCaseBackupBundleAdmin,
  saveLegalAlert,
  savePartnerCode,
  saveProcedureCatalogItem,
  saveProfessionalEntry,
  subscribePartnerCodesAdmin,
  type CaseBackupBundle,
} from '../services/firestoreService';
import type {
  BereavementCase,
  FamilyInvitation,
  LegalAlert,
  PartnerCode,
  ProcedureCatalogItem,
  ProfessionalEntry,
  RegionalOverride,
  UserProfile,
} from '../types/domain';
import {
  buildAdminContactRows,
  buildContactsCsv,
  triggerFileDownload,
} from '../utils/adminExport';
import { formatDateES } from '../utils/caseEngine';

interface AdminPanelProps {
  catalog: ProcedureCatalogItem[];
  legalAlerts: LegalAlert[];
  professionals: ProfessionalEntry[];
  onBack: () => void;
  onOpenCase: (bereavementCase: BereavementCase) => void;
}

type AdminTab = 'casos' | 'contactos' | 'tramites' | 'codigos' | 'cambios' | 'directorio';
type ContactFilter = 'all' | 'paid' | 'unpaid' | 'invited';

export const AdminPanel: React.FC<AdminPanelProps> = ({
  catalog,
  legalAlerts,
  professionals,
  onBack,
  onOpenCase,
}) => {
  const [tab, setTab] = useState<AdminTab>('casos');
  const [allCases, setAllCases] = useState<BereavementCase[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [allInvitations, setAllInvitations] = useState<FamilyInvitation[]>([]);
  const [partnerCodes, setPartnerCodes] = useState<PartnerCode[]>([]);
  const [adminDataLoading, setAdminDataLoading] = useState(true);
  const [adminDataError, setAdminDataError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Contacts & backup controls
  const [contactSearch, setContactSearch] = useState('');
  const [contactFilter, setContactFilter] = useState<ContactFilter>('all');
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [backupProgress, setBackupProgress] = useState<string | null>(null);
  const [exportingCaseId, setExportingCaseId] = useState<string | null>(null);

  // Procedure editor state
  const [editingProc, setEditingProc] = useState<ProcedureCatalogItem | null>(
    catalog[0] || null
  );
  const [selectedCcaa, setSelectedCcaa] = useState<string>('Madrid');
  const [docsText, setDocsText] = useState('');

  // New partner code form
  const [newCode, setNewCode] = useState('');
  const [newPartnerName, setNewPartnerName] = useState('');
  const [newPartnerType, setNewPartnerType] = useState<'funeraria' | 'aseguradora' | 'otro'>(
    'funeraria'
  );
  const [newMaxUses, setNewMaxUses] = useState(50);
  const [newExpiresAt, setNewExpiresAt] = useState('2027-12-31');

  // New legal alert form
  const [alertTitle, setAlertTitle] = useState('');
  const [alertSummary, setAlertSummary] = useState('');
  const [alertCcaa, setAlertCcaa] = useState('Todas');
  const [alertProcId, setAlertProcId] = useState('impuesto-sucesiones');
  const [alertSeverity, setAlertSeverity] = useState<'info' | 'importante'>('importante');

  // New directory entry form
  const [proName, setProName] = useState('');
  const [proCategory, setProCategory] = useState('Notarías');
  const [proCcaa, setProCcaa] = useState('Todas');
  const [proDesc, setProDesc] = useState('');
  const [proPhone, setProPhone] = useState('');
  const [proWebsite, setProWebsite] = useState('');

  useEffect(() => {
    let active = true;
    setAdminDataLoading(true);
    setAdminDataError(null);
    Promise.all([fetchAllCasesAdmin(), fetchAllUsersAdmin(), fetchAllInvitationsAdmin()])
      .then(([casesList, usersList, invitationsList]) => {
        if (!active) return;
        setAllCases(casesList);
        setAllUsers(usersList);
        setAllInvitations(invitationsList);
      })
      .catch((err) => {
        if (!active) return;
        setAdminDataError(
          err instanceof Error
            ? 'No se pudieron cargar todos los registros administrativos de Firestore.'
            : 'Error cargando los datos administrativos.'
        );
      })
      .finally(() => {
        if (active) setAdminDataLoading(false);
      });
    const unsubCodes = subscribePartnerCodesAdmin(setPartnerCodes);
    return () => {
      active = false;
      unsubCodes();
    };
  }, []);

  useEffect(() => {
    if (editingProc) {
      setDocsText(editingProc.requiredDocs.join('\n'));
    }
  }, [editingProc?.id]);

  const notify = (msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const contactRows = useMemo(
    () => buildAdminContactRows(allUsers, allCases, allInvitations),
    [allUsers, allCases, allInvitations]
  );

  const filteredContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    return contactRows.filter((row) => {
      if (contactFilter === 'paid') {
        if (row.paymentStatus !== 'paid_stripe' && row.paymentStatus !== 'paid_code') return false;
      } else if (contactFilter === 'unpaid') {
        if (row.paymentStatus !== 'pending') return false;
      } else if (contactFilter === 'invited') {
        if (row.paymentStatus !== 'family_invited') return false;
      }
      if (!q) return true;
      return (
        row.email.toLowerCase().includes(q) ||
        row.displayName.toLowerCase().includes(q) ||
        row.deceasedNames.some((n) => n.toLowerCase().includes(q)) ||
        row.ccaas.some((ca) => ca.toLowerCase().includes(q)) ||
        row.paymentLabel.toLowerCase().includes(q)
      );
    });
  }, [contactRows, contactFilter, contactSearch]);

  const contactStats = useMemo(() => {
    const payingContacts = contactRows.filter(
      (r) => r.paymentStatus === 'paid_stripe' || r.paymentStatus === 'paid_code'
    ).length;
    const paidCases = allCases.filter((c) => c.unlocked).length;
    const invitedPendingOrAccepted = allInvitations.filter((i) => i.status !== 'revoked').length;
    return {
      totalContacts: contactRows.length,
      payingContacts,
      totalCases: allCases.length,
      paidCases,
      invitedCount: invitedPendingOrAccepted,
    };
  }, [contactRows, allCases, allInvitations]);

  const handleExportContactsCsv = () => {
    const targetRows = filteredContacts.length > 0 ? filteredContacts : contactRows;
    if (targetRows.length === 0) {
      notify('No hay contactos para exportar todavía.');
      return;
    }
    const csv = buildContactsCsv(targetRows);
    const stamp = new Date().toISOString().slice(0, 10);
    triggerFileDownload(
      `despues-del-adios-contactos-${stamp}.csv`,
      csv,
      'text/csv;charset=utf-8;'
    );
    notify(`Listado exportado (${targetRows.length} contactos en formato CSV para Excel).`);
  };

  const handleExportSingleCaseBackup = async (bereavementCase: BereavementCase) => {
    setExportingCaseId(bereavementCase.id);
    try {
      const bundle = await fetchCaseBackupBundleAdmin(bereavementCase, true);
      const safeName = bereavementCase.deceasedName
        .toLowerCase()
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40);
      const stamp = new Date().toISOString().slice(0, 10);
      triggerFileDownload(
        `copia-caso-${safeName || bereavementCase.id}-${stamp}.json`,
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            ...bundle,
          },
          null,
          2
        ),
        'application/json;charset=utf-8;'
      );
      notify(
        `Copia de seguridad descargada (${bundle.documents.length} documentos y ${bundle.notes.length} notas).`
      );
    } catch {
      notify('No se pudo generar la copia de seguridad de este caso.');
    } finally {
      setExportingCaseId(null);
    }
  };

  const handleExportFullBackupJson = async () => {
    if (backupProgress) return;
    setBackupProgress(`0/${allCases.length}`);
    try {
      const caseBundles: CaseBackupBundle[] = [];
      for (let i = 0; i < allCases.length; i += 1) {
        setBackupProgress(`${i + 1}/${allCases.length}`);
        const bundle = await fetchCaseBackupBundleAdmin(allCases[i], true);
        caseBundles.push(bundle);
      }
      const stamp = new Date().toISOString().slice(0, 10);
      const fullPayload = {
        exportedAt: new Date().toISOString(),
        summary: {
          usersCount: allUsers.length,
          casesCount: caseBundles.length,
          invitationsCount: allInvitations.length,
          documentsCount: caseBundles.reduce((acc, b) => acc + b.documents.length, 0),
          notesCount: caseBundles.reduce((acc, b) => acc + b.notes.length, 0),
        },
        users: allUsers,
        invitations: allInvitations,
        cases: caseBundles,
        partnerCodes,
        legalAlerts,
        professionals,
        proceduresCatalog: catalog,
      };
      triggerFileDownload(
        `despues-del-adios-copia-completa-${stamp}.json`,
        JSON.stringify(fullPayload, null, 2),
        'application/json;charset=utf-8;'
      );
      notify(
        `Copia completa descargada (${caseBundles.length} casos y ${fullPayload.summary.documentsCount} documentos).`
      );
    } catch {
      notify('No se pudo completar la copia de seguridad en JSON.');
    } finally {
      setBackupProgress(null);
    }
  };

  const handleSaveProc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProc) return;
    const cleanDocs = docsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    await saveProcedureCatalogItem({
      ...editingProc,
      requiredDocs: cleanDocs,
    });
    notify('Cambios guardados en el catálogo de trámites.');
  };

  const updateOverride = (patch: Partial<RegionalOverride>) => {
    if (!editingProc) return;
    const current = editingProc.regionalOverrides?.[selectedCcaa] || {};
    const nextOverride: RegionalOverride = { ...current, ...patch };
    setEditingProc({
      ...editingProc,
      regionalOverrides: {
        ...editingProc.regionalOverrides,
        [selectedCcaa]: nextOverride,
      },
    });
  };

  const removeOverride = () => {
    if (!editingProc) return;
    const copy = { ...editingProc.regionalOverrides };
    delete copy[selectedCcaa];
    setEditingProc({ ...editingProc, regionalOverrides: copy });
  };

  const handleCreateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const now = new Date().toISOString();
    await savePartnerCode({
      id: newCode.trim().toUpperCase(),
      code: newCode.trim().toUpperCase(),
      partnerName: newPartnerName.trim(),
      partnerType: newPartnerType,
      maxUses: Number(newMaxUses) || 50,
      usedCount: 0,
      active: true,
      expiresAt: newExpiresAt || undefined,
      createdAt: now,
      updatedAt: now,
    });
    setNewCode('');
    setNewPartnerName('');
    notify('Código de entidad creado correctamente.');
  };

  const handleCreateAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    const now = new Date().toISOString();
    await saveLegalAlert({
      id: `alerta_${Date.now()}`,
      title: alertTitle.trim(),
      summary: alertSummary.trim(),
      effectiveDate: now.slice(0, 10),
      affectedCcaas: [alertCcaa],
      affectedProcedureIds: alertProcId ? [alertProcId] : [],
      severity: alertSeverity,
      published: true,
      createdAt: now,
      updatedAt: now,
    });
    setAlertTitle('');
    setAlertSummary('');
    notify('Aviso legal publicado y vinculado a los casos afectados.');
  };

  const handleCreatePro = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveProfessionalEntry({
      id: `prof_${Date.now()}`,
      name: proName.trim(),
      category: proCategory,
      ccaa: proCcaa,
      description: proDesc.trim(),
      phone: proPhone.trim() || undefined,
      website: proWebsite.trim() || undefined,
      isPublicService: false,
      updatedAt: new Date().toISOString(),
    });
    setProName('');
    setProDesc('');
    setProPhone('');
    setProWebsite('');
    notify('Profesional añadido al directorio.');
  };

  const currentOverride = editingProc?.regionalOverrides?.[selectedCcaa] || {};

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#1C1E22] flex flex-col">
      <header className="sticky top-0 z-30 border-b border-[#E7E2D8] bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg hover:bg-[#FAF8F5]"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <p className="text-xs text-[#8F754B] inline-flex items-center gap-1 font-medium">
                <Shield className="w-3.5 h-3.5" /> Panel interno de administración
              </p>
              <h1 className="font-display text-2xl font-semibold text-[#141518]">
                Después del adiós
              </h1>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center gap-6 overflow-x-auto border-t border-[#EFECE5]">
          {(
            [
              { id: 'casos', label: 'Casos', icon: FileText },
              { id: 'contactos', label: 'Contactos y copias', icon: Users },
              { id: 'tramites', label: 'Trámites y plazos', icon: FileText },
              { id: 'codigos', label: 'Códigos', icon: KeyRound },
              { id: 'cambios', label: 'Cambios legales', icon: Bell },
              { id: 'directorio', label: 'Directorio', icon: BookOpen },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`py-3 min-h-[44px] text-xs sm:text-sm font-medium border-b-2 inline-flex items-center gap-2 whitespace-nowrap shrink-0 ${
                  active
                    ? 'border-[#8F754B] text-[#141518]'
                    : 'border-transparent text-[#666A73] hover:text-[#141518]'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {statusMsg && (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 inline-flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{statusMsg}</span>
          </div>
        )}

        {adminDataError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            {adminDataError}
          </div>
        )}

        {/* TAB 1: CASOS */}
        {tab === 'casos' && (
          <div className="rounded-2xl bg-white border border-[#E7E2D8] overflow-hidden">
            <div className="p-5 border-b border-[#EFECE5] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="font-display text-2xl font-semibold">
                Casos registrados ({allCases.length})
              </h2>
              <button
                type="button"
                onClick={() => void handleExportFullBackupJson()}
                disabled={Boolean(backupProgress) || allCases.length === 0}
                className="min-h-[44px] px-4 rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] text-xs sm:text-sm font-medium text-[#141518] hover:bg-[#F3EFE6] inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                <Download className="w-4 h-4 text-[#8F754B]" />
                <span>
                  {backupProgress
                    ? `Preparando copia (${backupProgress})...`
                    : 'Copia completa (JSON)'}
                </span>
              </button>
            </div>
            <div className="divide-y divide-[#EFECE5]">
              {allCases.map((c) => (
                <div
                  key={c.id}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-[#141518]">{c.deceasedName}</p>
                    <p className="text-xs text-[#666A73] font-mono-num tabular-nums mt-0.5">
                      Titular: {c.ownerEmail} · {c.ccaa} · Fallecimiento: {formatDateES(c.deathDate)}{' '}
                      ·{' '}
                      <span
                        className={
                          c.unlocked ? 'text-emerald-800 font-medium' : 'text-[#8F754B] font-medium'
                        }
                      >
                        {c.unlockMethod === 'stripe'
                          ? 'Pagado (Stripe)'
                          : c.unlockMethod === 'partner_code'
                          ? `Código: ${c.unlockCodeUsed}`
                          : 'Pendiente de pago'}
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleExportSingleCaseBackup(c)}
                      disabled={exportingCaseId === c.id}
                      className="min-h-[44px] px-3.5 rounded-xl border border-[#D8D0C2] text-xs font-medium text-[#45484F] hover:bg-[#FAF8F5] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
                    >
                      <Download className="w-3.5 h-3.5 text-[#8F754B]" />
                      <span>{exportingCaseId === c.id ? 'Exportando...' : 'Copia JSON'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenCase(c)}
                      className="min-h-[44px] px-4 rounded-xl border border-[#D8D0C2] text-xs font-semibold text-[#141518] hover:bg-[#FAF8F5] whitespace-nowrap shrink-0"
                    >
                      Abrir caso
                    </button>
                  </div>
                </div>
              ))}
              {!adminDataLoading && allCases.length === 0 && (
                <p className="p-6 text-sm text-[#666A73]">Todavía no hay casos creados.</p>
              )}
              {adminDataLoading && (
                <p className="p-6 text-sm text-[#666A73]">Cargando casos registrados...</p>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: CONTACTOS Y COPIAS */}
        {tab === 'contactos' && (
          <div className="space-y-6">
            <div className="rounded-2xl bg-white border border-[#E7E2D8] grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 divide-x divide-[#EFECE5]">
              <div className="p-4 sm:p-5">
                <p className="text-xs text-[#666A73]">Contactos totales</p>
                <p className="mt-1 text-2xl font-semibold text-[#141518] font-mono-num tabular-nums">
                  {contactStats.totalContacts}
                </p>
              </div>
              <div className="p-4 sm:p-5">
                <p className="text-xs text-[#666A73]">Clientes con pago activo</p>
                <p className="mt-1 text-2xl font-semibold text-emerald-800 font-mono-num tabular-nums">
                  {contactStats.payingContacts}
                </p>
              </div>
              <div className="p-4 sm:p-5">
                <p className="text-xs text-[#666A73]">Casos pagados / totales</p>
                <p className="mt-1 text-2xl font-semibold text-[#141518] font-mono-num tabular-nums">
                  {contactStats.paidCases} / {contactStats.totalCases}
                </p>
              </div>
              <div className="p-4 sm:p-5">
                <p className="text-xs text-[#666A73]">Invitaciones familiares</p>
                <p className="mt-1 text-2xl font-semibold text-[#141518] font-mono-num tabular-nums">
                  {contactStats.invitedCount}
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-white border border-[#E7E2D8] p-4 sm:p-5 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-[#666A73] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    placeholder="Buscar por correo, nombre, fallecido o CCAA..."
                    className="w-full min-h-[44px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] pl-10 pr-3.5 text-sm text-[#141518] focus:outline-none focus:border-[#8F754B]"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportContactsCsv}
                    disabled={adminDataLoading || contactRows.length === 0}
                    className="min-h-[44px] px-4 rounded-xl bg-[#141518] text-[#F6F4EF] text-xs sm:text-sm font-medium hover:bg-[#25272D] inline-flex items-center gap-2 whitespace-nowrap shrink-0 disabled:opacity-50"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-[#D6C3A5]" />
                    <span>Exportar CSV (Excel)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleExportFullBackupJson()}
                    disabled={Boolean(backupProgress) || adminDataLoading}
                    className="min-h-[44px] px-4 rounded-xl border border-[#D8D0C2] bg-white text-[#141518] text-xs sm:text-sm font-medium hover:bg-[#FAF8F5] inline-flex items-center gap-2 whitespace-nowrap shrink-0 disabled:opacity-50"
                  >
                    <Download className="w-4 h-4 text-[#8F754B]" />
                    <span>
                      {backupProgress
                        ? `Copiando (${backupProgress})...`
                        : 'Copia completa (JSON)'}
                    </span>
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1 p-1 bg-[#FAF8F5] border border-[#E7E2D8] rounded-xl w-fit">
                {(
                  [
                    { id: 'all', label: 'Todos' },
                    { id: 'paid', label: 'Han pagado' },
                    { id: 'unpaid', label: 'Sin pago' },
                    { id: 'invited', label: 'Familiares invitados' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setContactFilter(item.id)}
                    className={`min-h-[40px] px-3.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      contactFilter === item.id
                        ? 'bg-white text-[#141518] shadow-sm'
                        : 'text-[#666A73] hover:text-[#141518]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-white border border-[#E7E2D8] overflow-hidden">
              {adminDataLoading ? (
                <div className="p-6 space-y-3">
                  <div className="h-10 rounded-lg bg-[#FAF8F5] animate-pulse" />
                  <div className="h-10 rounded-lg bg-[#FAF8F5] animate-pulse" />
                  <div className="h-10 rounded-lg bg-[#FAF8F5] animate-pulse" />
                </div>
              ) : filteredContacts.length === 0 ? (
                <div className="p-8 text-center space-y-3">
                  <p className="text-sm text-[#5B5E65]">
                    {contactRows.length === 0
                      ? 'Todavía no hay usuarios ni contactos registrados en la base de datos.'
                      : 'No hay contactos que coincidan con el filtro o la búsqueda actual.'}
                  </p>
                  {contactRows.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setContactSearch('');
                        setContactFilter('all');
                      }}
                      className="min-h-[44px] px-4 rounded-xl border border-[#D8D0C2] text-xs font-medium text-[#141518] hover:bg-[#FAF8F5]"
                    >
                      Mostrar todos los contactos
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Desktop Table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[#EFECE5] text-xs font-medium text-[#666A73]">
                          <th className="py-3.5 px-4">Contacto</th>
                          <th className="py-3.5 px-4">Tipo y pago</th>
                          <th className="py-3.5 px-4">Casos / CCAA</th>
                          <th className="py-3.5 px-4 text-right">Alta</th>
                          <th className="py-3.5 px-4 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EFECE5] text-sm">
                        {filteredContacts.map((row) => (
                          <tr key={row.key} className="hover:bg-[#FAF8F5]/70 transition-colors">
                            <td className="py-3.5 px-4 align-top">
                              <p className="font-medium text-[#141518]">{row.displayName}</p>
                              <p className="text-xs text-[#5B5E65] font-mono-num">{row.email}</p>
                            </td>
                            <td className="py-3.5 px-4 align-top">
                              <p className="text-xs text-[#5B5E65]">{row.roleLabel}</p>
                              <p
                                className={`text-xs font-medium mt-0.5 ${
                                  row.paymentStatus === 'paid_stripe' ||
                                  row.paymentStatus === 'paid_code'
                                    ? 'text-emerald-800'
                                    : row.paymentStatus === 'pending'
                                    ? 'text-[#8F754B]'
                                    : 'text-[#45484F]'
                                }`}
                              >
                                {row.paymentLabel}
                              </p>
                            </td>
                            <td className="py-3.5 px-4 align-top text-xs text-[#45484F]">
                              {row.deceasedNames.length > 0 ? (
                                <>
                                  <p className="font-medium text-[#141518]">
                                    {row.deceasedNames.join(' · ')}
                                  </p>
                                  {row.ccaas.length > 0 && (
                                    <p className="text-[#666A73] mt-0.5">{row.ccaas.join(', ')}</p>
                                  )}
                                </>
                              ) : (
                                <span className="text-[#8A8E96]">Sin caso creado</span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 align-top text-right text-xs text-[#666A73] font-mono-num tabular-nums whitespace-nowrap">
                              {row.createdAt ? formatDateES(row.createdAt.slice(0, 10)) : '—'}
                            </td>
                            <td className="py-3.5 px-4 align-top text-right">
                              <div className="inline-flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    void navigator.clipboard.writeText(row.email);
                                    setCopiedEmail(row.key);
                                    setTimeout(() => setCopiedEmail(null), 1800);
                                  }}
                                  className="min-h-[40px] px-3 rounded-lg border border-[#D8D0C2] text-xs font-medium text-[#45484F] hover:bg-white inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>{copiedEmail === row.key ? 'Copiado' : 'Copiar'}</span>
                                </button>
                                {row.primaryCase && (
                                  <button
                                    type="button"
                                    onClick={() => onOpenCase(row.primaryCase!)}
                                    className="min-h-[40px] px-3 rounded-lg border border-[#D8D0C2] text-xs font-semibold text-[#141518] hover:bg-white whitespace-nowrap shrink-0"
                                  >
                                    Abrir caso
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile List */}
                  <div className="md:hidden divide-y divide-[#EFECE5]">
                    {filteredContacts.map((row) => (
                      <div key={row.key} className="p-4 space-y-2.5">
                        <div>
                          <p className="text-sm font-semibold text-[#141518]">{row.displayName}</p>
                          <p className="text-xs text-[#5B5E65] font-mono-num break-all">
                            {row.email}
                          </p>
                        </div>
                        <p className="text-xs text-[#666A73] font-mono-num tabular-nums">
                          {row.roleLabel} ·{' '}
                          <span
                            className={
                              row.paymentStatus === 'paid_stripe' ||
                              row.paymentStatus === 'paid_code'
                                ? 'text-emerald-800 font-medium'
                                : row.paymentStatus === 'pending'
                                ? 'text-[#8F754B] font-medium'
                                : 'text-[#45484F]'
                            }
                          >
                            {row.paymentLabel}
                          </span>
                          {row.createdAt ? ` · Alta ${formatDateES(row.createdAt.slice(0, 10))}` : ''}
                        </p>
                        {row.deceasedNames.length > 0 && (
                          <p className="text-xs text-[#45484F]">
                            {row.deceasedNames.join(' · ')}
                            {row.ccaas.length > 0 ? ` (${row.ccaas.join(', ')})` : ''}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard.writeText(row.email);
                              setCopiedEmail(row.key);
                              setTimeout(() => setCopiedEmail(null), 1800);
                            }}
                            className="min-h-[44px] px-3.5 rounded-xl border border-[#D8D0C2] text-xs font-medium text-[#45484F] inline-flex items-center gap-1.5"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span>{copiedEmail === row.key ? 'Correo copiado' : 'Copiar correo'}</span>
                          </button>
                          {row.primaryCase && (
                            <button
                              type="button"
                              onClick={() => onOpenCase(row.primaryCase!)}
                              className="min-h-[44px] px-3.5 rounded-xl border border-[#D8D0C2] text-xs font-semibold text-[#141518]"
                            >
                              Abrir caso
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: TRÁMITES Y PLAZOS */}
        {tab === 'tramites' && (
          <div className="grid lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4 space-y-2">
              <button
                type="button"
                onClick={() =>
                  setEditingProc({
                    id: `tramite-${Date.now()}`,
                    title: 'Nuevo trámite',
                    summary: '',
                    whatIsIt: '',
                    whereToDoIt: '',
                    consequencesIfSkipped: '',
                    requiredDocs: [],
                    deadlineKind: 'recommended',
                    deadlineUnit: 'months',
                    deadlineValue: 1,
                    priorityBucket: 'months',
                    sortOrder: catalog.length + 1,
                    visible: true,
                    rules: { always: true },
                    regionalOverrides: {},
                    updatedAt: new Date().toISOString(),
                  })
                }
                className="w-full min-h-[44px] rounded-xl bg-[#141518] text-[#F6F4EF] text-sm font-medium inline-flex items-center justify-center gap-2 mb-3"
              >
                <Plus className="w-4 h-4 text-[#D6C3A5]" />
                <span>Crear nuevo trámite</span>
              </button>

              <div className="space-y-1.5 max-h-[70vh] overflow-y-auto pr-1">
                {catalog.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setEditingProc(item)}
                    className={`w-full text-left rounded-xl border p-3 text-xs sm:text-sm transition-colors ${
                      editingProc?.id === item.id
                        ? 'bg-[#141518] text-[#F6F4EF] border-[#141518]'
                        : 'bg-white text-[#1C1E22] border-[#E7E2D8] hover:bg-[#F5F1EA]'
                    }`}
                  >
                    <p className="font-medium truncate">{item.title}</p>
                    <p
                      className={`text-[11px] mt-0.5 ${
                        editingProc?.id === item.id ? 'text-[#CFC9BE]' : 'text-[#666A73]'
                      }`}
                    >
                      {item.visible ? 'Visible' : 'Oculto'} · {item.priorityBucket} ·{' '}
                      {Object.keys(item.regionalOverrides || {}).length} notas CCAA
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {editingProc && (
              <form
                onSubmit={handleSaveProc}
                className="lg:col-span-8 rounded-2xl bg-white border border-[#E7E2D8] p-5 sm:p-6 space-y-5"
              >
                <div className="flex items-center justify-between gap-4">
                  <h2 className="font-display text-2xl font-semibold text-[#141518]">
                    Editar ficha del trámite
                  </h2>
                  <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingProc.visible}
                      onChange={(e) =>
                        setEditingProc({ ...editingProc, visible: e.target.checked })
                      }
                      className="w-4 h-4 accent-[#8F754B]"
                    />
                    <span>Mostrar a las familias</span>
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#45484F] mb-1">Título</label>
                  <input
                    type="text"
                    value={editingProc.title}
                    onChange={(e) => setEditingProc({ ...editingProc, title: e.target.value })}
                    required
                    className="w-full min-h-[44px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] px-3.5 text-sm"
                  />
                </div>

                <div className="grid sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#45484F] mb-1">Urgencia</label>
                    <select
                      value={editingProc.priorityBucket}
                      onChange={(e) =>
                        setEditingProc({
                          ...editingProc,
                          priorityBucket: e.target.value as ProcedureCatalogItem['priorityBucket'],
                        })
                      }
                      className="w-full min-h-[44px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] px-3 text-sm"
                    >
                      <option value="first">Haz esto primero</option>
                      <option value="months">Próximos meses</option>
                      <option value="later">Más adelante</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#45484F] mb-1">Tipo plazo</label>
                    <select
                      value={editingProc.deadlineKind}
                      onChange={(e) =>
                        setEditingProc({
                          ...editingProc,
                          deadlineKind: e.target.value as ProcedureCatalogItem['deadlineKind'],
                        })
                      }
                      className="w-full min-h-[44px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] px-3 text-sm"
                    >
                      <option value="legal">Plazo legal</option>
                      <option value="recommended">Orientativo</option>
                      <option value="none">Sin plazo</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#45484F] mb-1">Unidad</label>
                    <select
                      value={editingProc.deadlineUnit}
                      onChange={(e) =>
                        setEditingProc({
                          ...editingProc,
                          deadlineUnit: e.target.value as ProcedureCatalogItem['deadlineUnit'],
                        })
                      }
                      className="w-full min-h-[44px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] px-3 text-sm"
                    >
                      <option value="days">Días</option>
                      <option value="months">Meses</option>
                      <option value="none">Ninguna</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#45484F] mb-1">Valor</label>
                    <input
                      type="number"
                      min={0}
                      value={editingProc.deadlineValue}
                      onChange={(e) =>
                        setEditingProc({ ...editingProc, deadlineValue: Number(e.target.value) })
                      }
                      className="w-full min-h-[44px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] px-3 text-sm font-mono-num"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#45484F] mb-1">Qué es (lenguaje claro)</label>
                  <textarea
                    rows={3}
                    value={editingProc.whatIsIt}
                    onChange={(e) => setEditingProc({ ...editingProc, whatIsIt: e.target.value })}
                    className="w-full rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] p-3 text-sm"
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#45484F] mb-1">Dónde se hace</label>
                    <textarea
                      rows={2}
                      value={editingProc.whereToDoIt}
                      onChange={(e) =>
                        setEditingProc({ ...editingProc, whereToDoIt: e.target.value })
                      }
                      className="w-full rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] p-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#45484F] mb-1">
                      Qué pasa si no se hace
                    </label>
                    <textarea
                      rows={2}
                      value={editingProc.consequencesIfSkipped}
                      onChange={(e) =>
                        setEditingProc({ ...editingProc, consequencesIfSkipped: e.target.value })
                      }
                      className="w-full rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] p-3 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#45484F] mb-1">
                    Documentos necesarios (uno por línea)
                  </label>
                  <textarea
                    rows={3}
                    value={docsText}
                    onChange={(e) => setDocsText(e.target.value)}
                    className="w-full rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] p-3 text-sm"
                  />
                </div>

                {/* Regional Adjustments */}
                <div className="pt-4 border-t border-[#E7E2D8] space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[#141518]">
                      Ajustes por Comunidad Autónoma
                    </h3>
                    <select
                      value={selectedCcaa}
                      onChange={(e) => setSelectedCcaa(e.target.value)}
                      className="min-h-[40px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] px-3 text-xs font-medium"
                    >
                      {COMUNIDADES_AUTONOMAS.map((ca) => (
                        <option key={ca} value={ca}>
                          {ca}
                        </option>
                      ))}
                    </select>
                  </div>

                  <label className="flex items-center gap-2 text-xs text-[#45484F]">
                    <input
                      type="checkbox"
                      checked={Boolean(currentOverride.notApplicable)}
                      onChange={(e) => updateOverride({ notApplicable: e.target.checked })}
                      className="w-4 h-4 accent-[#8F754B]"
                    />
                    <span>Este trámite no se aplica en {selectedCcaa}</span>
                  </label>

                  <input
                    type="text"
                    value={currentOverride.whereToDoIt || ''}
                    onChange={(e) => updateOverride({ whereToDoIt: e.target.value })}
                    placeholder={`Organismo específico en ${selectedCcaa} (opcional)`}
                    className="w-full min-h-[42px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] px-3 text-xs sm:text-sm"
                  />

                  <textarea
                    rows={2}
                    value={currentOverride.regionalNote || ''}
                    onChange={(e) => updateOverride({ regionalNote: e.target.value })}
                    placeholder={`Nota informativa para ${selectedCcaa} (ej. bonificaciones o plazos propios)`}
                    className="w-full rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] p-3 text-xs sm:text-sm"
                  />

                  {editingProc.regionalOverrides?.[selectedCcaa] && (
                    <button
                      type="button"
                      onClick={removeOverride}
                      className="text-xs text-red-700 hover:underline"
                    >
                      Quitar ajuste específico de {selectedCcaa}
                    </button>
                  )}
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="min-h-[48px] px-6 rounded-xl bg-[#8F754B] text-white text-sm font-semibold hover:bg-[#7A633E]"
                  >
                    Guardar cambios del trámite
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* TAB 3: CÓDIGOS */}
        {tab === 'codigos' && (
          <div className="space-y-6">
            <form
              onSubmit={handleCreateCode}
              className="rounded-2xl bg-white border border-[#E7E2D8] p-5 space-y-4"
            >
              <h2 className="font-display text-2xl font-semibold">
                Nuevo código para funeraria o aseguradora
              </h2>
              <div className="grid sm:grid-cols-5 gap-3">
                <input
                  type="text"
                  required
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  placeholder="CÓDIGO (ej. FUNERARIA-SOL)"
                  className="sm:col-span-2 min-h-[44px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] px-3 text-sm uppercase font-mono-num"
                />
                <input
                  type="text"
                  required
                  value={newPartnerName}
                  onChange={(e) => setNewPartnerName(e.target.value)}
                  placeholder="Nombre de la entidad"
                  className="sm:col-span-2 min-h-[44px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] px-3 text-sm"
                />
                <select
                  value={newPartnerType}
                  onChange={(e) =>
                    setNewPartnerType(e.target.value as 'funeraria' | 'aseguradora' | 'otro')
                  }
                  className="min-h-[44px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] px-3 text-sm"
                >
                  <option value="funeraria">Funeraria</option>
                  <option value="aseguradora">Aseguradora</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
              <div className="grid sm:grid-cols-3 gap-3 items-end">
                <div>
                  <label className="block text-xs text-[#5B5E65] mb-1">Máximo de usos</label>
                  <input
                    type="number"
                    min={1}
                    value={newMaxUses}
                    onChange={(e) => setNewMaxUses(Number(e.target.value))}
                    className="w-full min-h-[44px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] px-3 text-sm font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#5B5E65] mb-1">Caducidad</label>
                  <input
                    type="date"
                    value={newExpiresAt}
                    onChange={(e) => setNewExpiresAt(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] px-3 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="min-h-[44px] rounded-xl bg-[#141518] text-[#F6F4EF] text-sm font-semibold"
                >
                  Crear código
                </button>
              </div>
            </form>

            <div className="rounded-2xl bg-white border border-[#E7E2D8] divide-y divide-[#EFECE5]">
              {partnerCodes.map((c) => (
                <div
                  key={c.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-[#141518] font-mono-num">
                      {c.code} · {c.partnerName}
                    </p>
                    <p className="text-xs text-[#666A73] font-mono-num mt-0.5">
                      Usos: {c.usedCount}/{c.maxUses} · {c.active ? 'Activo' : 'Pausado'}
                      {c.expiresAt ? ` · Caduca: ${c.expiresAt}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void savePartnerCode({ ...c, active: !c.active })}
                    className="min-h-[38px] px-4 rounded-xl border border-[#D8D0C2] text-xs font-medium hover:bg-[#FAF8F5] shrink-0"
                  >
                    {c.active ? 'Pausar código' : 'Reactivar'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: CAMBIOS LEGALES */}
        {tab === 'cambios' && (
          <div className="space-y-6">
            <form
              onSubmit={handleCreateAlert}
              className="rounded-2xl bg-white border border-[#E7E2D8] p-5 space-y-4"
            >
              <h2 className="font-display text-2xl font-semibold">
                Publicar cambio legal o fiscal para casos afectados
              </h2>
              <input
                type="text"
                required
                value={alertTitle}
                onChange={(e) => setAlertTitle(e.target.value)}
                placeholder="Título claro del cambio o recordatorio normativo"
                className="w-full min-h-[44px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] px-3.5 text-sm"
              />
              <textarea
                rows={3}
                required
                value={alertSummary}
                onChange={(e) => setAlertSummary(e.target.value)}
                placeholder="Explicación sencilla para las familias afectadas..."
                className="w-full rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] p-3.5 text-sm"
              />
              <div className="grid sm:grid-cols-3 gap-3">
                <select
                  value={alertCcaa}
                  onChange={(e) => setAlertCcaa(e.target.value)}
                  className="min-h-[44px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] px-3 text-sm"
                >
                  <option value="Todas">Todas las comunidades</option>
                  {COMUNIDADES_AUTONOMAS.map((ca) => (
                    <option key={ca} value={ca}>
                      {ca}
                    </option>
                  ))}
                </select>
                <select
                  value={alertProcId}
                  onChange={(e) => setAlertProcId(e.target.value)}
                  className="min-h-[44px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] px-3 text-sm"
                >
                  {catalog.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
                <select
                  value={alertSeverity}
                  onChange={(e) => setAlertSeverity(e.target.value as 'info' | 'importante')}
                  className="min-h-[44px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] px-3 text-sm"
                >
                  <option value="importante">Importante</option>
                  <option value="info">Informativo</option>
                </select>
              </div>
              <button
                type="submit"
                className="min-h-[44px] px-5 rounded-xl bg-[#141518] text-[#F6F4EF] text-sm font-semibold"
              >
                Publicar aviso a casos afectados
              </button>
            </form>

            <div className="rounded-2xl bg-white border border-[#E7E2D8] divide-y divide-[#EFECE5]">
              {legalAlerts.map((a) => (
                <div
                  key={a.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-[#141518]">{a.title}</p>
                    <p className="text-xs text-[#666A73] mt-0.5">
                      {a.affectedCcaas.join(', ')} · {a.published ? 'Publicado' : 'Oculto'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void saveLegalAlert({ ...a, published: !a.published })}
                    className="min-h-[38px] px-4 rounded-xl border border-[#D8D0C2] text-xs font-medium shrink-0"
                  >
                    {a.published ? 'Retirar aviso' : 'Publicar'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 5: DIRECTORIO */}
        {tab === 'directorio' && (
          <div className="space-y-6">
            <form
              onSubmit={handleCreatePro}
              className="rounded-2xl bg-white border border-[#E7E2D8] p-5 space-y-4"
            >
              <h2 className="font-display text-2xl font-semibold">Añadir al directorio</h2>
              <div className="grid sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  required
                  value={proName}
                  onChange={(e) => setProName(e.target.value)}
                  placeholder="Nombre del organismo o despacho"
                  className="min-h-[44px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] px-3 text-sm"
                />
                <input
                  type="text"
                  required
                  value={proCategory}
                  onChange={(e) => setProCategory(e.target.value)}
                  placeholder="Categoría"
                  className="min-h-[44px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] px-3 text-sm"
                />
                <select
                  value={proCcaa}
                  onChange={(e) => setProCcaa(e.target.value)}
                  className="min-h-[44px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] px-3 text-sm"
                >
                  <option value="Todas">Toda España</option>
                  {COMUNIDADES_AUTONOMAS.map((ca) => (
                    <option key={ca} value={ca}>
                      {ca}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                rows={2}
                required
                value={proDesc}
                onChange={(e) => setProDesc(e.target.value)}
                placeholder="Descripción breve de cómo ayudan..."
                className="w-full rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] p-3 text-sm"
              />
              <div className="grid sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  value={proPhone}
                  onChange={(e) => setProPhone(e.target.value)}
                  placeholder="Teléfono (opcional)"
                  className="min-h-[44px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] px-3 text-sm"
                />
                <input
                  type="url"
                  value={proWebsite}
                  onChange={(e) => setProWebsite(e.target.value)}
                  placeholder="Web (https://...)"
                  className="min-h-[44px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] px-3 text-sm"
                />
                <button
                  type="submit"
                  className="min-h-[44px] rounded-xl bg-[#141518] text-[#F6F4EF] text-sm font-semibold"
                >
                  Añadir ficha
                </button>
              </div>
            </form>

            <div className="rounded-2xl bg-white border border-[#E7E2D8] divide-y divide-[#EFECE5]">
              {professionals.map((p) => (
                <div key={p.id} className="p-4">
                  <p className="text-sm font-semibold text-[#141518]">{p.name}</p>
                  <p className="text-xs text-[#666A73] mt-0.5">
                    {p.category} · {p.ccaa}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
