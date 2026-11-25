import { useEffect, useState } from 'react';
import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import type { PendingCasePayment } from './config/pricing';
import { ADMIN_EMAIL, auth, googleProvider, testFirestoreConnection } from './firebase';
import {
  INITIAL_LEGAL_ALERTS,
  INITIAL_PROCEDURES_CATALOG,
  INITIAL_PROFESSIONALS,
} from './data/proceduresCatalog';
import {
  acceptFamilyInvitation,
  bootstrapAdminSeedIfNeeded,
  createBereavementCase,
  deleteBereavementCase,
  ensureUserProfile,
  getInvitationByCode,
  subscribeLegalAlerts,
  subscribeProceduresCatalog,
  subscribeProfessionals,
  subscribeUserCases,
  unlockCaseWithStripeProof,
  updateCaseDetailsAndAnswers,
} from './services/firestoreService';
import { deleteCaseReminderSchedule } from './services/remindersClient';
import type {
  BereavementCase,
  FamilyInvitation,
  LegalAlert,
  ProcedureCatalogItem,
  ProfessionalEntry,
  QuestionnaireAnswers,
} from './types/domain';
import {
  loadCasesSnapshot,
  loadGlobalCatalogSnapshot,
  saveCasesSnapshot,
  saveGlobalCatalogSnapshot,
} from './utils/offlineCache';
import { AdminPanel } from './components/AdminPanel';
import { CaseWorkspace } from './components/CaseWorkspace';
import { LandingView } from './components/LandingView';
import { MyCasesView } from './components/MyCasesView';
import { OfflineIndicator } from './components/OfflineIndicator';
import { QuestionnaireWizard } from './components/QuestionnaireWizard';
import { UnlockCaseModal } from './components/UnlockCaseModal';

type AppScreen = 'cases' | 'new_case' | 'edit_case' | 'case_detail' | 'admin';

function paymentStorageKey(uid: string): string {
  return `dda_paid_pass_${uid}`;
}

function loadStoredPaidPass(uid: string): PendingCasePayment | null {
  try {
    const raw = sessionStorage.getItem(paymentStorageKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingCasePayment;
    if (
      parsed &&
      (parsed.method === 'stripe' || parsed.method === 'partner_code') &&
      typeof parsed.codeOrReceipt === 'string' &&
      parsed.codeOrReceipt.length > 0
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function saveStoredPaidPass(uid: string, payment: PendingCasePayment | null): void {
  try {
    if (!payment) {
      sessionStorage.removeItem(paymentStorageKey(uid));
    } else {
      sessionStorage.setItem(paymentStorageKey(uid), JSON.stringify(payment));
    }
  } catch {
    // ignore storage restriction
  }
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNeedsNewTab, setAuthNeedsNewTab] = useState(false);

  const [screen, setScreen] = useState<AppScreen>('cases');
  const [cases, setCases] = useState<BereavementCase[]>([]);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [adminSelectedCase, setAdminSelectedCase] = useState<BereavementCase | null>(null);

  const [pendingNewCasePayment, setPendingNewCasePayment] = useState<PendingCasePayment | null>(null);
  const [payModalTarget, setPayModalTarget] = useState<'new_case' | BereavementCase | null>(null);

  const offlineCatalog = loadGlobalCatalogSnapshot();
  const [catalog, setCatalog] = useState<ProcedureCatalogItem[]>(
    offlineCatalog.procedures || INITIAL_PROCEDURES_CATALOG
  );
  const [legalAlerts, setLegalAlerts] = useState<LegalAlert[]>(
    offlineCatalog.alerts || INITIAL_LEGAL_ALERTS
  );
  const [professionals, setProfessionals] = useState<ProfessionalEntry[]>(
    offlineCatalog.professionals || INITIAL_PROFESSIONALS
  );

  // Invitation handling (?invite=inv_...)
  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('invite');
  });
  const [pendingInvite, setPendingInvite] = useState<FamilyInvitation | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);

  const isAdmin = Boolean(user && user.email === ADMIN_EMAIL && user.emailVerified);

  // Check Firestore connection and any pending Google redirect login on startup
  useEffect(() => {
    void testFirestoreConnection();
    void getRedirectResult(auth).catch((err) => {
      const code = (err as { code?: string })?.code || '';
      if (code && code !== 'auth/no-auth-event') {
        console.error('Redirect auth error:', code, err);
        setAuthError(
          `No se pudo completar el acceso con Google (${code}). Vuelve a intentarlo.`
        );
      }
    });
  }, []);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (nextUser) {
        setCases(loadCasesSnapshot(nextUser.uid));
        setPendingNewCasePayment(loadStoredPaidPass(nextUser.uid));
        try {
          await ensureUserProfile(nextUser);
          await bootstrapAdminSeedIfNeeded(nextUser.email);
        } catch (err) {
          console.warn('Error preparando perfil:', err);
        }
      } else {
        setCases([]);
        setActiveCaseId(null);
        setPendingNewCasePayment(null);
        setPayModalTarget(null);
        setScreen('cases');
      }
    });
    return () => unsub();
  }, []);

  // Firestore real-time subscriptions when signed in
  useEffect(() => {
    if (!user) return;
    const unsubCases = subscribeUserCases(
      user.uid,
      (list) => {
        setCases(list);
        saveCasesSnapshot(user.uid, list);
      },
      () => {
        setCases(loadCasesSnapshot(user.uid));
      }
    );
    const unsubCatalog = subscribeProceduresCatalog((items) => {
      setCatalog(items);
    });
    const unsubAlerts = subscribeLegalAlerts((items) => {
      setLegalAlerts(items);
    });
    const unsubPros = subscribeProfessionals((items) => {
      setProfessionals(items);
    });

    return () => {
      unsubCases();
      unsubCatalog();
      unsubAlerts();
      unsubPros();
    };
  }, [user]);

  useEffect(() => {
    saveGlobalCatalogSnapshot(catalog, legalAlerts, professionals);
  }, [catalog, legalAlerts, professionals]);

  // Handle pending family invitation lookup once signed in
  useEffect(() => {
    if (!user || !pendingInviteCode) return;
    void getInvitationByCode(pendingInviteCode)
      .then((inv) => {
        if (inv && inv.status === 'pending') {
          setPendingInvite(inv);
        } else if (inv && inv.status === 'accepted') {
          setActiveCaseId(inv.caseId);
          setScreen('case_detail');
          setPendingInviteCode(null);
        } else {
          setInviteMessage('El enlace de invitación ya no está disponible.');
          setPendingInviteCode(null);
        }
      })
      .catch(() => {});
  }, [user, pendingInviteCode]);

  // Handle Stripe redirect return (?new_case_paid=1&stripe_session_id=... OR ?unlock_case=...&stripe_session_id=...)
  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const newCasePaid = params.get('new_case_paid');
    const unlockCaseId = params.get('unlock_case');
    const stripeSessionId = params.get('stripe_session_id');
    const unlockCancelled = params.get('unlock_cancelled');

    if (unlockCancelled) {
      setInviteMessage('El pago no se completó. Puedes intentarlo de nuevo o aplicar un código cuando quieras.');
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (!stripeSessionId || (!newCasePaid && !unlockCaseId)) return;

    void (async () => {
      try {
        const token = await user.getIdToken();
        const resp = await fetch('/api/payments/verify-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            caseId: newCasePaid ? 'new_case' : unlockCaseId,
            sessionId: stripeSessionId,
          }),
        });
        const data = (await resp.json()) as { verified?: boolean; receiptId?: string };
        if (resp.ok && data.verified && data.receiptId) {
          if (newCasePaid) {
            const payment: PendingCasePayment = {
              method: 'stripe',
              codeOrReceipt: data.receiptId,
              paidAt: new Date().toISOString(),
            };
            saveStoredPaidPass(user.uid, payment);
            setPendingNewCasePayment(payment);
            setPayModalTarget(null);
            setScreen('new_case');
          } else if (unlockCaseId) {
            await unlockCaseWithStripeProof(unlockCaseId, data.receiptId);
            setPayModalTarget(null);
            setActiveCaseId(unlockCaseId);
            setScreen('case_detail');
          }
        }
      } finally {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    })();
  }, [user]);

  const handleLogin = async () => {
    if (authLoading) return;
    setAuthError(null);
    setAuthNeedsNewTab(false);
    setAuthLoading(true);
    const isInIframe = (() => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    })();

    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const fbErr = err as { code?: string; message?: string };
      const code = fbErr?.code || '';
      const msg = fbErr?.message || '';
      console.error('Google Sign-In error:', code, msg);

      if (code === 'auth/popup-closed-by-user' || msg.includes('popup-closed-by-user')) {
        setAuthError(null);
      } else if (code === 'auth/cancelled-popup-request') {
        setAuthError('Ya hay una ventana de acceso abierta. Revisa las ventanas de tu navegador o inténtalo de nuevo.');
      } else if (
        code === 'auth/popup-blocked' ||
        code === 'auth/operation-not-supported-in-this-environment' ||
        code === 'auth/internal-error' ||
        code === 'auth/web-storage-unsupported'
      ) {
        if (!isInIframe) {
          try {
            await signInWithRedirect(auth, googleProvider);
            return;
          } catch (redirErr) {
            console.error('Redirect fallback error:', redirErr);
          }
        }
        setAuthNeedsNewTab(true);
        setAuthError(
          isInIframe
            ? `Tu navegador bloqueó la ventana de Google dentro de esta vista previa (${code || 'ventana bloqueada'}). Abre la app en una pestaña nueva para iniciar sesión sin restricciones.`
            : `Tu navegador ha bloqueado la ventana emergente de Google (${code || 'popup bloqueado'}). Permite las ventanas emergentes o abre la app en una pestaña nueva.`
        );
      } else if (code === 'auth/unauthorized-domain') {
        setAuthNeedsNewTab(isInIframe);
        setAuthError(
          `El dominio actual (${window.location.hostname}) aún no está en la lista de dominios autorizados de Firebase Auth (${code}). Si eres quien administra la app, añádelo en Firebase Console → Authentication → Configuración → Dominios autorizados.`
        );
      } else if (code === 'auth/network-request-failed') {
        setAuthError(
          'No se pudo conectar con Google por un problema de red o bloqueador de contenido. Comprueba tu conexión e inténtalo de nuevo.'
        );
      } else {
        setAuthNeedsNewTab(isInIframe);
        setAuthError(
          `No se pudo completar el inicio de sesión con Google${code ? ` (${code})` : ''}. Inténtalo de nuevo o abre la aplicación en una pestaña nueva.`
        );
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const handleAcceptInvite = async () => {
    if (!user || !pendingInvite) return;
    setInviteBusy(true);
    try {
      const res = await acceptFamilyInvitation(pendingInvite.id, user);
      setPendingInvite(null);
      setPendingInviteCode(null);
      window.history.replaceState({}, document.title, window.location.pathname);
      setActiveCaseId(res.caseId);
      setScreen('case_detail');
    } catch (err) {
      setInviteMessage(err instanceof Error ? err.message : 'No se pudo aceptar la invitación.');
    } finally {
      setInviteBusy(false);
    }
  };

  const handleRequestNewCase = () => {
    if (isAdmin || pendingNewCasePayment) {
      setScreen('new_case');
    } else {
      setPayModalTarget('new_case');
    }
  };

  const handleCreateCase = async (payload: {
    deceasedName: string;
    deathDate: string;
    deathPlace: string;
    ccaa: string;
    answers: QuestionnaireAnswers;
  }) => {
    if (!user) return;
    if (!isAdmin && !pendingNewCasePayment) {
      setPayModalTarget('new_case');
      setScreen('cases');
      return;
    }

    const created = await createBereavementCase(user, payload, pendingNewCasePayment);
    if (created.unlocked) {
      saveStoredPaidPass(user.uid, null);
      setPendingNewCasePayment(null);
    }
    setActiveCaseId(created.id);
    setScreen('case_detail');
  };

  const handleUpdateCase = async (payload: {
    deceasedName: string;
    deathDate: string;
    deathPlace: string;
    ccaa: string;
    answers: QuestionnaireAnswers;
  }) => {
    if (!activeCase) return;
    await updateCaseDetailsAndAnswers(activeCase.id, payload);
    setScreen('case_detail');
  };

  const activeCase =
    cases.find((c) => c.id === activeCaseId) ||
    (adminSelectedCase && adminSelectedCase.id === activeCaseId ? adminSelectedCase : null);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#121316] text-[#F6F4EF] flex items-center justify-center p-6">
        <p className="font-display text-2xl text-[#D6C3A5]">Después del adiós…</p>
      </div>
    );
  }

  return (
    <>
      <OfflineIndicator />

      {!user ? (
        <LandingView
          onStartLogin={() => void handleLogin()}
          authLoading={authLoading}
          authError={authError}
          showNewTabAuthHelp={authNeedsNewTab}
        />
      ) : screen === 'new_case' && (isAdmin || Boolean(pendingNewCasePayment)) ? (
        <QuestionnaireWizard
          onCancel={() => setScreen('cases')}
          onSave={handleCreateCase}
        />
      ) : screen === 'edit_case' && activeCase && (activeCase.unlocked || isAdmin) ? (
        <QuestionnaireWizard
          initialCase={activeCase}
          onCancel={() => setScreen('case_detail')}
          onSave={handleUpdateCase}
        />
      ) : screen === 'admin' && isAdmin ? (
        <AdminPanel
          catalog={catalog}
          legalAlerts={legalAlerts}
          professionals={professionals}
          onBack={() => setScreen('cases')}
          onOpenCase={(c) => {
            setAdminSelectedCase(c);
            setActiveCaseId(c.id);
            setScreen('case_detail');
          }}
        />
      ) : screen === 'case_detail' && activeCase ? (
        <CaseWorkspace
          user={user}
          bereavementCase={activeCase}
          catalog={catalog}
          legalAlerts={legalAlerts}
          professionals={professionals}
          onBack={() => {
            setAdminSelectedCase(null);
            setScreen('cases');
          }}
          onEditAnswers={() => setScreen('edit_case')}
        />
      ) : (
        <MyCasesView
          user={user}
          cases={cases}
          catalog={catalog}
          pendingInvite={pendingInvite}
          inviteBusy={inviteBusy}
          inviteMessage={inviteMessage}
          pendingNewCasePayment={pendingNewCasePayment}
          onAcceptInvite={() => void handleAcceptInvite()}
          onDismissInvite={() => {
            setPendingInvite(null);
            setPendingInviteCode(null);
            window.history.replaceState({}, document.title, window.location.pathname);
          }}
          onCreateNewCase={handleRequestNewCase}
          onSelectCase={(id) => {
            setActiveCaseId(id);
            setScreen('case_detail');
          }}
          onUnlockExistingCase={(c) => setPayModalTarget(c)}
          onDeleteCase={(id) => {
            void deleteBereavementCase(id);
            void deleteCaseReminderSchedule(id);
          }}
          onOpenAdmin={() => setScreen('admin')}
          onSignOut={() => void handleSignOut()}
        />
      )}

      {user && payModalTarget && (
        <UnlockCaseModal
          bereavementCase={payModalTarget === 'new_case' ? null : payModalTarget}
          onClose={() => setPayModalTarget(null)}
          onNewCasePaid={(payment) => {
            saveStoredPaidPass(user.uid, payment);
            setPendingNewCasePayment(payment);
            setPayModalTarget(null);
            setScreen('new_case');
          }}
          onUnlocked={(msg) => {
            const targetId = payModalTarget !== 'new_case' ? payModalTarget.id : null;
            setPayModalTarget(null);
            setInviteMessage(msg);
            if (targetId) {
              setActiveCaseId(targetId);
              setScreen('case_detail');
            }
          }}
        />
      )}
    </>
  );
}
