import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
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

type AppScreen = 'cases' | 'new_case' | 'edit_case' | 'case_detail' | 'admin';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [screen, setScreen] = useState<AppScreen>('cases');
  const [cases, setCases] = useState<BereavementCase[]>([]);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [adminSelectedCase, setAdminSelectedCase] = useState<BereavementCase | null>(null);

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

  // Check Firestore connection on startup
  useEffect(() => {
    void testFirestoreConnection();
  }, []);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (nextUser) {
        setCases(loadCasesSnapshot(nextUser.uid));
        try {
          await ensureUserProfile(nextUser);
          await bootstrapAdminSeedIfNeeded(nextUser.email);
        } catch (err) {
          console.warn('Error preparando perfil:', err);
        }
      } else {
        setCases([]);
        setActiveCaseId(null);
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

  // Handle Stripe redirect return (?unlock_case=...&stripe_session_id=...)
  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const unlockCaseId = params.get('unlock_case');
    const stripeSessionId = params.get('stripe_session_id');
    if (!unlockCaseId || !stripeSessionId) return;

    void (async () => {
      try {
        const token = await user.getIdToken();
        const resp = await fetch('/api/payments/verify-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ caseId: unlockCaseId, sessionId: stripeSessionId }),
        });
        const data = (await resp.json()) as { verified?: boolean; receiptId?: string };
        if (resp.ok && data.verified && data.receiptId) {
          await unlockCaseWithStripeProof(unlockCaseId, data.receiptId);
          setActiveCaseId(unlockCaseId);
          setScreen('case_detail');
        }
      } finally {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    })();
  }, [user]);

  const handleLogin = async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes('popup-closed-by-user')) {
        setAuthError(
          'No se pudo completar el inicio de sesión con Google. Inténtalo de nuevo.'
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

  const handleCreateCase = async (payload: {
    deceasedName: string;
    deathDate: string;
    deathPlace: string;
    ccaa: string;
    answers: QuestionnaireAnswers;
  }) => {
    if (!user) return;
    const created = await createBereavementCase(user, payload);
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
        />
      ) : screen === 'new_case' ? (
        <QuestionnaireWizard
          onCancel={() => setScreen('cases')}
          onSave={handleCreateCase}
        />
      ) : screen === 'edit_case' && activeCase ? (
        <QuestionnaireWizard
          initialCase={activeCase}
          onCancel={() => setScreen('case_detail')}
          onSave={handleUpdateCase}
        />
      ) : screen === 'admin' && user.email === ADMIN_EMAIL && user.emailVerified ? (
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
          onAcceptInvite={() => void handleAcceptInvite()}
          onDismissInvite={() => {
            setPendingInvite(null);
            setPendingInviteCode(null);
            window.history.replaceState({}, document.title, window.location.pathname);
          }}
          onCreateNewCase={() => setScreen('new_case')}
          onSelectCase={(id) => {
            setActiveCaseId(id);
            setScreen('case_detail');
          }}
          onDeleteCase={(id) => {
            void deleteBereavementCase(id);
            void deleteCaseReminderSchedule(id);
          }}
          onOpenAdmin={() => setScreen('admin')}
          onSignOut={() => void handleSignOut()}
        />
      )}
    </>
  );
}
