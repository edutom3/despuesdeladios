import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, CreditCard, HelpCircle, Lock, LogOut, Plus, Shield, Trash2, Users } from 'lucide-react';
import type { User } from 'firebase/auth';
import { CASE_PRICE_LABEL, type PendingCasePayment } from '../config/pricing';
import { ADMIN_EMAIL } from '../firebase';
import type { BereavementCase, FamilyInvitation, ProcedureCatalogItem } from '../types/domain';
import { buildPersonalizedProcedures, daysSinceDate, formatDateES } from '../utils/caseEngine';
import { LegalDisclaimerFooter } from './LegalDisclaimerFooter';
import { LegalFaqDrawer } from './LegalFaqDrawer';

interface MyCasesViewProps {
  user: User;
  cases: BereavementCase[];
  catalog: ProcedureCatalogItem[];
  pendingInvite: FamilyInvitation | null;
  inviteBusy: boolean;
  inviteMessage: string | null;
  pendingNewCasePayment: PendingCasePayment | null;
  onAcceptInvite: () => void;
  onDismissInvite: () => void;
  onCreateNewCase: () => void;
  onSelectCase: (caseId: string) => void;
  onUnlockExistingCase: (bereavementCase: BereavementCase) => void;
  onDeleteCase: (caseId: string) => void;
  onOpenAdmin: () => void;
  onSignOut: () => void;
}

export const MyCasesView: React.FC<MyCasesViewProps> = ({
  user,
  cases,
  catalog,
  pendingInvite,
  inviteBusy,
  inviteMessage,
  pendingNewCasePayment,
  onAcceptInvite,
  onDismissInvite,
  onCreateNewCase,
  onSelectCase,
  onUnlockExistingCase,
  onDeleteCase,
  onOpenAdmin,
  onSignOut,
}) => {
  const [faqOpen, setFaqOpen] = useState(false);
  const isAdmin = user.email === ADMIN_EMAIL && user.emailVerified;
  const hasAnyUnlockedAccess = cases.some((c) => c.unlocked);
  const ownCases = cases.filter((c) => c.ownerId === user.uid);
  const sharedCases = cases.filter((c) => c.ownerId !== user.uid);

  const renderCaseCard = (c: BereavementCase, isShared: boolean) => {
    const procs = buildPersonalizedProcedures(c, catalog);
    const doneCount = procs.filter((p) => c.taskStates[p.id]?.done).length;
    const days = daysSinceDate(c.deathDate);
    const canEnter = c.unlocked;

    return (
      <div
        key={c.id}
        className="rounded-2xl bg-white border border-[#E7E2D8] p-5 sm:p-6 flex flex-col justify-between gap-4 hover:border-[#CBBCA2] transition-colors"
      >
        <div>
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-display text-2xl font-semibold text-[#141518] leading-tight">
              {c.deceasedName}
            </h3>
            {!isShared && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteCase(c.id);
                }}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[#7A7D85] hover:text-red-700 hover:bg-red-50 transition-colors"
                title="Eliminar caso"
                aria-label={`Eliminar caso de ${c.deceasedName}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          <p className="mt-1.5 text-xs text-[#666A73] font-mono-num">
            {c.ccaa} · {formatDateES(c.deathDate)} · Hace {days} días
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#45484F]">
            <span>
              {doneCount} de {procs.length} trámites hechos
            </span>
            <span aria-hidden="true">·</span>
            <span>{c.unlocked ? 'Caso activo' : `Pendiente de pago (${CASE_PRICE_LABEL})`}</span>
            {isShared && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1 text-[#7D633A] font-medium">
                  <Users className="w-3.5 h-3.5" /> Compartido contigo
                </span>
              </>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => (canEnter ? onSelectCase(c.id) : onUnlockExistingCase(c))}
          className={`w-full min-h-[44px] rounded-xl text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 ${
            canEnter
              ? 'bg-[#141518] text-[#F6F4EF] hover:bg-[#25272D]'
              : 'bg-[#8F754B] text-white hover:bg-[#7A633E]'
          }`}
        >
          {!canEnter && <CreditCard className="w-4 h-4 shrink-0" />}
          <span>{canEnter ? 'Abrir caso' : `Pagar ${CASE_PRICE_LABEL} para abrir`}</span>
          {canEnter && <ArrowRight className="w-4 h-4 shrink-0" />}
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F5] text-[#1C1E22]">
      <header className="sticky top-0 z-30 border-b border-[#E7E2D8] bg-[#FAF8F5]/95 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <span className="font-display text-xl sm:text-2xl font-semibold text-[#141518] whitespace-nowrap shrink-0">
            Después del adiós
          </span>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {isAdmin && (
              <button
                type="button"
                onClick={onOpenAdmin}
                className="min-h-[40px] px-3 py-2 rounded-xl border border-[#CBBCA2] bg-[#F5F0E6] text-xs font-medium text-[#6B532E] hover:bg-[#EDE4D3] inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Panel interno</span>
              </button>
            )}
            <button
              type="button"
              onClick={onSignOut}
              className="min-h-[40px] px-3 py-2 rounded-xl border border-[#DDD5C7] bg-white text-xs font-medium text-[#45484F] hover:bg-[#F5F1EA] inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8">
        {pendingInvite && (
          <div className="rounded-2xl border border-[#CBBCA2] bg-[#F5EFE4] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-[#7D633A]">Invitación familiar</p>
              <h2 className="font-display text-2xl font-semibold text-[#141518] mt-0.5">
                {pendingInvite.ownerName} te ha invitado al caso de {pendingInvite.caseTitle}
              </h2>
              <p className="text-sm text-[#4D5057] mt-1">
                Permiso asignado:{' '}
                <strong>
                  {pendingInvite.role === 'collaborate'
                    ? 'Colaborar (marcar trámites, subir documentos y dejar notas)'
                    : 'Solo ver'}
                </strong>
              </p>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={onDismissInvite}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-[#D8D0C2] bg-white text-sm font-medium text-[#45484F]"
              >
                Ahora no
              </button>
              <button
                type="button"
                onClick={onAcceptInvite}
                disabled={inviteBusy}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-[#141518] text-[#F6F4EF] text-sm font-semibold hover:bg-[#25272D] disabled:opacity-60"
              >
                {inviteBusy ? 'Uniéndote...' : 'Aceptar y abrir caso'}
              </button>
            </div>
          </div>
        )}

        {pendingNewCasePayment && (
          <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-emerald-950">
                  Acceso activado listo para tu nuevo caso
                </p>
                <p className="text-xs sm:text-sm text-emerald-900 mt-0.5">
                  Pago confirmado correctamente. Completa ahora el cuestionario de 4 pasos para
                  generar tu lista de trámites y calendario.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onCreateNewCase}
              className="min-h-[44px] px-5 rounded-xl bg-emerald-900 text-white text-sm font-semibold hover:bg-emerald-950 shrink-0"
            >
              Completar cuestionario
            </button>
          </div>
        )}

        {inviteMessage && (
          <div className="rounded-xl border border-[#D6C3A5] bg-[#F7F2E8] px-4 py-3 text-sm text-[#4F3D22]">
            {inviteMessage}
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-xs text-[#6E6A63]">
              Sesión iniciada como {user.displayName || user.email}
            </p>
            <h1 className="font-display text-3xl sm:text-4xl font-semibold text-[#141518] mt-1">
              Mis casos
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {hasAnyUnlockedAccess && (
              <button
                type="button"
                onClick={() => setFaqOpen(true)}
                className="min-h-[48px] px-4 py-2.5 rounded-xl border border-[#D8D0C2] bg-white text-[#1C1E22] text-sm font-medium hover:bg-[#F5F1EA] transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
              >
                <HelpCircle className="w-4 h-4 text-[#8F754B]" />
                <span>Dudas frecuentes</span>
              </button>
            )}

            <button
              type="button"
              onClick={onCreateNewCase}
              className="min-h-[48px] px-5 py-2.5 rounded-xl bg-[#141518] text-[#F6F4EF] text-sm font-semibold hover:bg-[#25272D] transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
            >
              {pendingNewCasePayment ? (
                <Plus className="w-4 h-4 text-[#D6C3A5] shrink-0" />
              ) : (
                <CreditCard className="w-4 h-4 text-[#D6C3A5] shrink-0" />
              )}
              <span>
                {pendingNewCasePayment
                  ? 'Abrir un caso nuevo'
                  : `Pagar ${CASE_PRICE_LABEL} · Nuevo caso`}
              </span>
            </button>
          </div>
        </div>

        {!pendingNewCasePayment && (ownCases.length > 0 || sharedCases.length > 0) && !hasAnyUnlockedAccess && (
          <div className="rounded-2xl border border-[#CBBCA2] bg-[#F5EFE4] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-[#7D633A]">Acceso completo bajo pago único</p>
              <p className="text-sm text-[#1C1E22] leading-relaxed">
                Sin realizar el pago único de <strong>{CASE_PRICE_LABEL}</strong> no es posible abrir
                ni gestionar los trámites del caso.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const lockedTarget = ownCases.find((c) => !c.unlocked) || sharedCases.find((c) => !c.unlocked);
                if (lockedTarget) onUnlockExistingCase(lockedTarget);
                else onCreateNewCase();
              }}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#8F754B] text-white text-sm font-semibold hover:bg-[#7A633E] transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
            >
              <CreditCard className="w-4 h-4 shrink-0" />
              <span>Pagar {CASE_PRICE_LABEL} ahora</span>
            </button>
          </div>
        )}

        {ownCases.length === 0 && sharedCases.length === 0 ? (
          <div className="rounded-2xl border border-[#E7E2D8] bg-white p-8 sm:p-12 text-center max-w-2xl mx-auto">
            {pendingNewCasePayment ? (
              <>
                <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#141518]">
                  Aún no tienes ningún caso guardado
                </h2>
                <p className="mt-3 text-sm sm:text-base text-[#5B5E65] leading-relaxed">
                  Contesta 4 pasos breves y guardaremos de forma privada tu lista ordenada de
                  trámites, el calendario personalizado y los documentos necesarios.
                </p>
                <button
                  type="button"
                  onClick={onCreateNewCase}
                  className="mt-6 min-h-[48px] px-6 py-3 rounded-xl bg-[#8F754B] text-white text-sm font-semibold hover:bg-[#7A633E] transition-colors inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Empezar cuestionario inicial</span>
                </button>
              </>
            ) : (
              <>
                <div className="w-11 h-11 rounded-2xl bg-[#F5F0E6] border border-[#D8D0C2] flex items-center justify-center mx-auto mb-4">
                  <Lock className="w-5 h-5 text-[#8F754B]" />
                </div>
                <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#141518]">
                  Pago necesario para empezar ({CASE_PRICE_LABEL})
                </h2>
                <p className="mt-3 text-sm sm:text-base text-[#5B5E65] leading-relaxed">
                  Para poder crear tu caso y acceder al cuestionario, trámites, calendario, avisos
                  por correo, notas rápidas, documentos y familia es necesario realizar un pago único
                  de <strong>{CASE_PRICE_LABEL}</strong>.
                </p>
                <div className="mt-6 flex justify-center">
                  <button
                    type="button"
                    onClick={onCreateNewCase}
                    className="w-full sm:w-auto min-h-[48px] px-6 py-3 rounded-xl bg-[#141518] text-[#F6F4EF] text-sm font-semibold hover:bg-[#25272D] transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    <CreditCard className="w-4 h-4 text-[#D6C3A5] shrink-0" />
                    <span>Pagar {CASE_PRICE_LABEL} y empezar</span>
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-10">
            {ownCases.length > 0 && (
              <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {ownCases.map((c) => renderCaseCard(c, false))}
              </section>
            )}

            {sharedCases.length > 0 && (
              <section className="space-y-4">
                <h2 className="font-display text-2xl font-semibold text-[#141518]">
                  Compartidos contigo
                </h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {sharedCases.map((c) => renderCaseCard(c, true))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      <LegalDisclaimerFooter variant="light" />

      {hasAnyUnlockedAccess && (
        <LegalFaqDrawer
          open={faqOpen}
          onClose={() => setFaqOpen(false)}
          cases={cases}
        />
      )}
    </div>
  );
};
