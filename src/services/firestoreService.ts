import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { ADMIN_EMAIL, db, handleFirestoreError, OperationType } from '../firebase';
import {
  INITIAL_LEGAL_ALERTS,
  INITIAL_PARTNER_CODES,
  INITIAL_PROCEDURES_CATALOG,
  INITIAL_PROFESSIONALS,
} from '../data/proceduresCatalog';
import type {
  BereavementCase,
  CaseDocument,
  CaseMember,
  CaseNote,
  CaseReminderLog,
  FamilyInvitation,
  LegalAlert,
  PartnerCode,
  ProcedureCatalogItem,
  ProfessionalEntry,
  QuestionnaireAnswers,
  TaskState,
  UserProfile,
} from '../types/domain';

function makeId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now()}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${rand.slice(0, 20)}`;
}

export async function ensureUserProfile(user: User): Promise<UserProfile> {
  const path = `users/${user.uid}`;
  try {
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);
    const now = new Date().toISOString();
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }
    const profile: UserProfile = {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || user.email?.split('@')[0] || 'Titular',
      reminderOptIn: true,
      reminderDaysBefore: 7,
      createdAt: now,
      updatedAt: now,
    };
    await setDoc(ref, profile);
    return profile;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function bootstrapAdminSeedIfNeeded(userEmail: string | null | undefined): Promise<void> {
  if (userEmail !== ADMIN_EMAIL) return;
  try {
    const procSnap = await getDocs(collection(db, 'procedures'));
    if (procSnap.empty) {
      const batch = writeBatch(db);
      for (const item of INITIAL_PROCEDURES_CATALOG) {
        batch.set(doc(db, 'procedures', item.id), item);
      }
      for (const code of INITIAL_PARTNER_CODES) {
        batch.set(doc(db, 'partnerCodes', code.id), code);
      }
      for (const alert of INITIAL_LEGAL_ALERTS) {
        batch.set(doc(db, 'legalAlerts', alert.id), alert);
      }
      for (const prof of INITIAL_PROFESSIONALS) {
        batch.set(doc(db, 'professionals', prof.id), prof);
      }
      await batch.commit();
    }
  } catch (err) {
    console.warn('No se pudo inicializar el catálogo en Firestore automáticamente:', err);
  }
}

export function subscribeUserCases(
  uid: string,
  onData: (cases: BereavementCase[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'cases';
  const q = query(collection(db, 'cases'), where('memberUids', 'array-contains', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) => ({
        ...(d.data() as Omit<BereavementCase, 'id'>),
        id: d.id,
      }));
      list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      onData(list);
    },
    (error) => {
      if (onError) onError(error);
      else handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function fetchAllCasesAdmin(): Promise<BereavementCase[]> {
  const path = 'cases';
  try {
    const snap = await getDocs(collection(db, 'cases'));
    const list = snap.docs.map((d) => ({
      ...(d.data() as Omit<BereavementCase, 'id'>),
      id: d.id,
    }));
    list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function createBereavementCase(
  user: User,
  payload: {
    deceasedName: string;
    deathDate: string;
    deathPlace: string;
    ccaa: string;
    answers: QuestionnaireAnswers;
  },
  paymentProof?: {
    method: 'stripe' | 'partner_code';
    codeOrReceipt: string;
  } | null
): Promise<BereavementCase> {
  const caseId = makeId('case');
  const now = new Date().toISOString();
  const displayName = user.displayName || user.email?.split('@')[0] || 'Titular';

  if (!paymentProof) {
    throw new Error('Es necesario completar el pago o aplicar un código válido antes de crear el caso.');
  }

  const newCaseData: Omit<BereavementCase, 'id'> = {
    ownerId: user.uid,
    ownerEmail: user.email || '',
    ownerName: displayName,
    deceasedName: payload.deceasedName.trim(),
    deathDate: payload.deathDate,
    deathPlace: payload.deathPlace.trim(),
    ccaa: payload.ccaa,
    answers: payload.answers,
    unlocked: false,
    unlockMethod: 'free',
    memberUids: [user.uid],
    collaboratorUids: [user.uid],
    taskStates: {},
    docStates: {},
    reminderEmail: user.email || '',
    reminderEnabled: true,
    reminderDaysBefore: 7,
    reminderOnlyLegal: false,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, 'cases', caseId), newCaseData);
    const ownerMember: CaseMember = {
      uid: user.uid,
      email: user.email || '',
      displayName,
      role: 'owner',
      addedAt: now,
    };
    await setDoc(doc(db, 'cases', caseId, 'members', user.uid), ownerMember);
    const createdCase: BereavementCase = { id: caseId, ...newCaseData };

    if (paymentProof) {
      if (paymentProof.method === 'stripe') {
        await unlockCaseWithStripeProof(caseId, paymentProof.codeOrReceipt);
        return {
          ...createdCase,
          unlocked: true,
          unlockMethod: 'stripe',
          unlockCodeUsed: paymentProof.codeOrReceipt.slice(0, 64),
        };
      }
      if (paymentProof.method === 'partner_code') {
        await redeemPartnerCodeOnCase(createdCase, paymentProof.codeOrReceipt);
        return {
          ...createdCase,
          unlocked: true,
          unlockMethod: 'partner_code',
          unlockCodeUsed: paymentProof.codeOrReceipt.trim().toUpperCase(),
        };
      }
    }

    return createdCase;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `cases/${caseId}`);
  }
}

export async function updateCaseDetailsAndAnswers(
  caseId: string,
  updates: Partial<
    Pick<
      BereavementCase,
      | 'deceasedName'
      | 'deathDate'
      | 'deathPlace'
      | 'ccaa'
      | 'answers'
      | 'reminderEmail'
      | 'reminderEnabled'
      | 'reminderDaysBefore'
      | 'reminderOnlyLegal'
    >
  >
): Promise<void> {
  const path = `cases/${caseId}`;
  try {
    await updateDoc(doc(db, 'cases', caseId), {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteBereavementCase(caseId: string): Promise<void> {
  const path = `cases/${caseId}`;
  try {
    await deleteDoc(doc(db, 'cases', caseId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function updateCaseTaskState(
  caseId: string,
  currentTaskStates: Record<string, TaskState>,
  procedureId: string,
  nextState: TaskState
): Promise<void> {
  const path = `cases/${caseId}`;
  try {
    await updateDoc(doc(db, 'cases', caseId), {
      taskStates: {
        ...currentTaskStates,
        [procedureId]: nextState,
      },
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function toggleCaseDocumentGathered(
  caseId: string,
  currentDocStates: Record<string, { gathered: boolean; updatedAt?: string; updatedByName?: string }>,
  docKey: string,
  gathered: boolean,
  updatedByName: string
): Promise<void> {
  const path = `cases/${caseId}`;
  const now = new Date().toISOString();
  try {
    await updateDoc(doc(db, 'cases', caseId), {
      docStates: {
        ...currentDocStates,
        [docKey]: { gathered, updatedAt: now, updatedByName },
      },
      updatedAt: now,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function unlockCaseWithStripeProof(
  caseId: string,
  receiptId: string
): Promise<void> {
  const path = `cases/${caseId}`;
  try {
    await updateDoc(doc(db, 'cases', caseId), {
      unlocked: true,
      unlockMethod: 'stripe',
      unlockCodeUsed: receiptId.slice(0, 64),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function validatePartnerCodeAvailable(
  rawCode: string
): Promise<{ code: string; partnerName: string }> {
  const normalized = rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,64}$/.test(normalized)) {
    throw new Error('El código introducido no tiene un formato válido.');
  }

  const codeRef = doc(db, 'partnerCodes', normalized);
  const codeSnap = await getDoc(codeRef);
  if (!codeSnap.exists()) {
    throw new Error('Ese código no existe o no es válido. Revisa las letras y guiones.');
  }

  const codeData = codeSnap.data() as PartnerCode;
  if (!codeData.active) {
    throw new Error('Este código está pausado temporalmente por la entidad emisora.');
  }
  if (codeData.usedCount >= codeData.maxUses) {
    throw new Error('Este código ha alcanzado el límite máximo de usos disponibles.');
  }
  if (codeData.expiresAt) {
    const todayISO = new Date().toISOString().slice(0, 10);
    if (codeData.expiresAt < todayISO) {
      throw new Error('Este código ha caducado.');
    }
  }

  return { code: normalized, partnerName: codeData.partnerName };
}

export async function redeemPartnerCodeOnCase(
  caseItem: BereavementCase,
  rawCode: string
): Promise<{ partnerName: string }> {
  const normalized = rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,64}$/.test(normalized)) {
    throw new Error('El código introducido no tiene un formato válido.');
  }
  if (caseItem.unlocked && caseItem.unlockCodeUsed === normalized) {
    return { partnerName: 'Código ya aplicado a este caso' };
  }
  if (caseItem.unlocked) {
    throw new Error('Este caso ya está desbloqueado por completo.');
  }

  const codeRef = doc(db, 'partnerCodes', normalized);
  const codeSnap = await getDoc(codeRef);
  if (!codeSnap.exists()) {
    throw new Error('Ese código no existe o no es válido. Revisa las letras y guiones.');
  }

  const codeData = codeSnap.data() as PartnerCode;
  if (!codeData.active) {
    throw new Error('Este código está pausado temporalmente por la entidad emisora.');
  }
  if (codeData.usedCount >= codeData.maxUses) {
    throw new Error('Este código ha alcanzado el límite máximo de usos disponibles.');
  }
  if (codeData.expiresAt) {
    const todayISO = new Date().toISOString().slice(0, 10);
    if (codeData.expiresAt < todayISO) {
      throw new Error('Este código ha caducado.');
    }
  }

  const now = new Date().toISOString();
  const batch = writeBatch(db);
  batch.update(doc(db, 'cases', caseItem.id), {
    unlocked: true,
    unlockMethod: 'partner_code',
    unlockCodeUsed: normalized,
    updatedAt: now,
  });
  batch.update(codeRef, {
    usedCount: codeData.usedCount + 1,
    updatedAt: now,
  });

  try {
    await batch.commit();
    return { partnerName: codeData.partnerName };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `cases/${caseItem.id}`);
  }
}

// --- Family Members & Invitations ---
export function subscribeCaseMembers(
  caseId: string,
  onData: (members: CaseMember[]) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'cases', caseId, 'members'),
    (snap) => {
      const list = snap.docs.map((d) => d.data() as CaseMember);
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, `cases/${caseId}/members`);
    }
  );
}

export function subscribeCaseInvitations(
  caseId: string,
  ownerId: string,
  onData: (invites: FamilyInvitation[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'invitations'),
    where('ownerId', '==', ownerId),
    where('caseId', '==', caseId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({
        ...(d.data() as Omit<FamilyInvitation, 'id'>),
        id: d.id,
      }));
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'invitations');
    }
  );
}

export async function createFamilyInvitation(
  caseItem: BereavementCase,
  invitedEmail: string,
  role: 'collaborate' | 'view'
): Promise<FamilyInvitation> {
  const inviteCode = makeId('inv');
  const now = new Date().toISOString();
  const inviteData: Omit<FamilyInvitation, 'id'> = {
    caseId: caseItem.id,
    caseTitle: caseItem.deceasedName,
    ownerId: caseItem.ownerId,
    ownerName: caseItem.ownerName,
    invitedEmail: invitedEmail.trim().toLowerCase(),
    role,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };
  try {
    await setDoc(doc(db, 'invitations', inviteCode), inviteData);
    return { id: inviteCode, ...inviteData };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `invitations/${inviteCode}`);
  }
}

export async function revokeFamilyInvitation(inviteCode: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'invitations', inviteCode), {
      status: 'revoked',
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `invitations/${inviteCode}`);
  }
}

export async function getInvitationByCode(inviteCode: string): Promise<FamilyInvitation | null> {
  try {
    const snap = await getDoc(doc(db, 'invitations', inviteCode));
    if (!snap.exists()) return null;
    return { ...(snap.data() as Omit<FamilyInvitation, 'id'>), id: snap.id };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `invitations/${inviteCode}`);
  }
}

export async function acceptFamilyInvitation(
  inviteCode: string,
  user: User
): Promise<{ caseId: string }> {
  const inviteSnap = await getDoc(doc(db, 'invitations', inviteCode));
  if (!inviteSnap.exists()) {
    throw new Error('La invitación no existe o el enlace está incompleto.');
  }
  const invite = inviteSnap.data() as Omit<FamilyInvitation, 'id'>;
  if (invite.status === 'revoked') {
    throw new Error('Esta invitación ha sido cancelada por la persona titular del caso.');
  }
  if (invite.status === 'accepted') {
    return { caseId: invite.caseId };
  }

  const caseSnap = await getDoc(doc(db, 'cases', invite.caseId));
  if (!caseSnap.exists()) {
    throw new Error('El caso asociado a esta invitación ya no existe.');
  }
  const caseData = caseSnap.data() as Omit<BereavementCase, 'id'>;
  if (caseData.memberUids.includes(user.uid)) {
    return { caseId: invite.caseId };
  }

  const now = new Date().toISOString();
  const displayName = user.displayName || user.email?.split('@')[0] || 'Familiar';
  const nextMembers = [...caseData.memberUids, user.uid];
  const nextCollabs =
    invite.role === 'collaborate'
      ? Array.from(new Set([...caseData.collaboratorUids, user.uid]))
      : caseData.collaboratorUids;

  const batch = writeBatch(db);
  batch.update(doc(db, 'invitations', inviteCode), {
    status: 'accepted',
    acceptedByUid: user.uid,
    updatedAt: now,
  });
  batch.set(doc(db, 'cases', invite.caseId, 'members', user.uid), {
    uid: user.uid,
    email: user.email || '',
    displayName,
    role: invite.role,
    inviteCode,
    addedAt: now,
  });
  batch.update(doc(db, 'cases', invite.caseId), {
    memberUids: nextMembers,
    collaboratorUids: nextCollabs,
    updatedAt: now,
  });

  try {
    await batch.commit();
    return { caseId: invite.caseId };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `cases/${invite.caseId}`);
  }
}

export async function updateMemberPermission(
  caseItem: BereavementCase,
  memberUid: string,
  newRole: 'collaborate' | 'view'
): Promise<void> {
  const now = new Date().toISOString();
  const nextCollabs =
    newRole === 'collaborate'
      ? Array.from(new Set([...caseItem.collaboratorUids, memberUid]))
      : caseItem.collaboratorUids.filter((u) => u !== memberUid);

  const batch = writeBatch(db);
  batch.update(doc(db, 'cases', caseItem.id, 'members', memberUid), {
    role: newRole,
  });
  batch.update(doc(db, 'cases', caseItem.id), {
    collaboratorUids: nextCollabs,
    updatedAt: now,
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `cases/${caseItem.id}`);
  }
}

export async function removeCaseMember(
  caseItem: BereavementCase,
  memberUid: string
): Promise<void> {
  if (memberUid === caseItem.ownerId) return;
  const now = new Date().toISOString();
  const batch = writeBatch(db);
  batch.delete(doc(db, 'cases', caseItem.id, 'members', memberUid));
  batch.update(doc(db, 'cases', caseItem.id), {
    memberUids: caseItem.memberUids.filter((u) => u !== memberUid),
    collaboratorUids: caseItem.collaboratorUids.filter((u) => u !== memberUid),
    updatedAt: now,
  });
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `cases/${caseItem.id}/members/${memberUid}`);
  }
}

// --- Notes ---
export function subscribeCaseNotes(
  caseId: string,
  onData: (notes: CaseNote[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(collection(db, 'cases', caseId, 'notes'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          ...(d.data() as Omit<CaseNote, 'id'>),
          id: d.id,
        }))
      );
    },
    (error) => {
      if (onError) {
        onError(error);
      } else {
        handleFirestoreError(error, OperationType.LIST, `cases/${caseId}/notes`);
      }
    }
  );
}

export async function addCaseNote(
  caseId: string,
  user: User,
  procedureId: string,
  text: string
): Promise<void> {
  const trimmedText = text.trim().slice(0, 2000);
  const safeProcedureId = procedureId.trim().slice(0, 120);
  if (!trimmedText) {
    throw new Error('Escribe una nota antes de guardarla.');
  }
  if (!safeProcedureId) {
    throw new Error('Selecciona un trámite válido para asociar la nota.');
  }
  const safeAuthorName =
    (user.displayName || user.email?.split('@')[0] || 'Familiar').trim().slice(0, 120) ||
    'Familiar';

  const noteId = makeId('note');
  const noteData: Omit<CaseNote, 'id'> = {
    authorUid: user.uid,
    authorName: safeAuthorName,
    procedureId: safeProcedureId,
    text: trimmedText,
    createdAt: new Date().toISOString(),
  };
  try {
    await setDoc(doc(db, 'cases', caseId, 'notes', noteId), noteData);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `cases/${caseId}/notes/${noteId}`);
  }
}

export async function deleteCaseNote(caseId: string, noteId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'cases', caseId, 'notes', noteId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `cases/${caseId}/notes/${noteId}`);
  }
}

// --- Private Documents & Scans ---
export function subscribeCaseDocuments(
  caseId: string,
  onData: (docs: CaseDocument[]) => void
): Unsubscribe {
  const q = query(collection(db, 'cases', caseId, 'documents'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          ...(d.data() as Omit<CaseDocument, 'id'>),
          id: d.id,
        }))
      );
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, `cases/${caseId}/documents`);
    }
  );
}

export async function uploadCaseDocument(
  caseId: string,
  user: User,
  payload: {
    docTypeKey: string;
    title: string;
    mimeType: string;
    fileSize: number;
    dataUrl: string;
    extractedDate?: string;
    extractedNumber?: string;
    extractedIssuer?: string;
    extractedSubject?: string;
  }
): Promise<string> {
  if (payload.dataUrl.length > 880000) {
    throw new Error('El archivo es demasiado pesado (máximo ~650 KB comprimido). Prueba con una foto más ligera.');
  }
  const docId = makeId('doc');
  const now = new Date().toISOString();
  const docMeta: Omit<CaseDocument, 'id'> = {
    docTypeKey: payload.docTypeKey,
    title: payload.title.trim().slice(0, 160),
    mimeType: payload.mimeType.slice(0, 80),
    fileSize: payload.fileSize,
    uploadedByUid: user.uid,
    uploadedByName: user.displayName || user.email?.split('@')[0] || 'Familiar',
    extractedDate: (payload.extractedDate || '').slice(0, 40),
    extractedNumber: (payload.extractedNumber || '').slice(0, 80),
    extractedIssuer: (payload.extractedIssuer || '').slice(0, 140),
    extractedSubject: (payload.extractedSubject || '').slice(0, 140),
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, 'cases', caseId, 'documents', docId), docMeta);
    await setDoc(doc(db, 'cases', caseId, 'documents', docId, 'files', 'payload'), {
      dataUrl: payload.dataUrl,
      uploadedByUid: user.uid,
      createdAt: now,
    });
    return docId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `cases/${caseId}/documents/${docId}`);
  }
}

export async function fetchCaseDocumentFileUrl(caseId: string, docId: string): Promise<string | null> {
  try {
    const snap = await getDoc(doc(db, 'cases', caseId, 'documents', docId, 'files', 'payload'));
    if (!snap.exists()) return null;
    return (snap.data() as { dataUrl?: string }).dataUrl || null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `cases/${caseId}/documents/${docId}/files/payload`);
  }
}

export async function updateCaseDocumentMeta(
  caseId: string,
  docId: string,
  updates: {
    title: string;
    extractedDate?: string;
    extractedNumber?: string;
    extractedIssuer?: string;
    extractedSubject?: string;
  }
): Promise<void> {
  try {
    await updateDoc(doc(db, 'cases', caseId, 'documents', docId), {
      title: updates.title.trim().slice(0, 160),
      extractedDate: (updates.extractedDate || '').slice(0, 40),
      extractedNumber: (updates.extractedNumber || '').slice(0, 80),
      extractedIssuer: (updates.extractedIssuer || '').slice(0, 140),
      extractedSubject: (updates.extractedSubject || '').slice(0, 140),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `cases/${caseId}/documents/${docId}`);
  }
}

export async function deleteCaseDocument(caseId: string, docId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'cases', caseId, 'documents', docId, 'files', 'payload')).catch(() => {});
    await deleteDoc(doc(db, 'cases', caseId, 'documents', docId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `cases/${caseId}/documents/${docId}`);
  }
}

// --- Automated & Manual Reminder Logs ---
export function subscribeCaseReminders(
  caseId: string,
  onData: (logs: CaseReminderLog[]) => void
): Unsubscribe {
  const q = query(collection(db, 'cases', caseId, 'reminders'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          ...(d.data() as Omit<CaseReminderLog, 'id'>),
          id: d.id,
        }))
      );
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, `cases/${caseId}/reminders`);
    }
  );
}

export async function saveCaseReminderLog(
  caseId: string,
  user: User,
  log: {
    id: string;
    recipientEmail: string;
    triggerType: 'auto' | 'manual_summary' | 'test';
    status: 'sent' | 'simulated_no_api_key' | 'error';
    subject: string;
    procedureIds: string[];
    procedureTitles: string[];
    resendId?: string;
    errorMessage?: string;
    createdAt: string;
  }
): Promise<void> {
  const logId = /^[a-zA-Z0-9_-]{1,128}$/.test(log.id) ? log.id : makeId('rem');
  const payload: Omit<CaseReminderLog, 'id'> = {
    recipientEmail: log.recipientEmail.slice(0, 200),
    triggerType: log.triggerType,
    status: log.status,
    subject: log.subject.slice(0, 200),
    procedureIds: log.procedureIds.slice(0, 30).map((s) => s.slice(0, 120)),
    procedureTitles: log.procedureTitles.slice(0, 30).map((s) => s.slice(0, 180)),
    ...(log.resendId ? { resendId: log.resendId.slice(0, 120) } : {}),
    ...(log.errorMessage ? { errorMessage: log.errorMessage.slice(0, 400) } : {}),
    createdByUid: user.uid,
    createdAt: log.createdAt.slice(0, 40),
  };

  try {
    await setDoc(doc(db, 'cases', caseId, 'reminders', logId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `cases/${caseId}/reminders/${logId}`);
  }
}

// --- Catalog, Partner Codes, Legal Alerts, Directory (Public Reads / Admin Writes) ---
export function subscribeProceduresCatalog(
  onData: (items: ProcedureCatalogItem[]) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'procedures'),
    (snap) => {
      if (snap.empty) {
        onData(INITIAL_PROCEDURES_CATALOG);
        return;
      }
      const list = snap.docs.map((d) => d.data() as ProcedureCatalogItem);
      list.sort((a, b) => a.sortOrder - b.sortOrder);
      onData(list);
    },
    () => {
      onData(INITIAL_PROCEDURES_CATALOG);
    }
  );
}

export async function saveProcedureCatalogItem(item: ProcedureCatalogItem): Promise<void> {
  try {
    await setDoc(doc(db, 'procedures', item.id), {
      ...item,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `procedures/${item.id}`);
  }
}

export function subscribePartnerCodesAdmin(
  onData: (codes: PartnerCode[]) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'partnerCodes'),
    (snap) => {
      const list = snap.docs.map((d) => ({ ...(d.data() as Omit<PartnerCode, 'id'>), id: d.id }));
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onData(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'partnerCodes');
    }
  );
}

export async function savePartnerCode(codeObj: PartnerCode): Promise<void> {
  const cleanId = codeObj.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (!cleanId) throw new Error('El código solo puede contener letras mayúsculas, números y guiones.');
  try {
    await setDoc(doc(db, 'partnerCodes', cleanId), {
      ...codeObj,
      id: cleanId,
      code: cleanId,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `partnerCodes/${cleanId}`);
  }
}

export function subscribeLegalAlerts(onData: (alerts: LegalAlert[]) => void): Unsubscribe {
  return onSnapshot(
    collection(db, 'legalAlerts'),
    (snap) => {
      if (snap.empty) {
        onData(INITIAL_LEGAL_ALERTS);
        return;
      }
      const list = snap.docs.map((d) => ({ ...(d.data() as Omit<LegalAlert, 'id'>), id: d.id }));
      list.sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
      onData(list);
    },
    () => {
      onData(INITIAL_LEGAL_ALERTS);
    }
  );
}

export async function saveLegalAlert(alert: LegalAlert): Promise<void> {
  const id = alert.id || makeId('alerta');
  try {
    await setDoc(doc(db, 'legalAlerts', id), {
      ...alert,
      id,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `legalAlerts/${id}`);
  }
}

export function subscribeProfessionals(onData: (entries: ProfessionalEntry[]) => void): Unsubscribe {
  return onSnapshot(
    collection(db, 'professionals'),
    (snap) => {
      if (snap.empty) {
        onData(INITIAL_PROFESSIONALS);
        return;
      }
      onData(snap.docs.map((d) => ({ ...(d.data() as Omit<ProfessionalEntry, 'id'>), id: d.id })));
    },
    () => {
      onData(INITIAL_PROFESSIONALS);
    }
  );
}

export async function saveProfessionalEntry(entry: ProfessionalEntry): Promise<void> {
  const id = entry.id || makeId('prof');
  try {
    await setDoc(doc(db, 'professionals', id), {
      ...entry,
      id,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `professionals/${id}`);
  }
}

export async function fetchAllUsersAdmin(): Promise<UserProfile[]> {
  const path = 'users';
  try {
    const snap = await getDocs(collection(db, path));
    const list = snap.docs.map((d) => d.data() as UserProfile);
    list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function fetchAllInvitationsAdmin(): Promise<FamilyInvitation[]> {
  const path = 'invitations';
  try {
    const snap = await getDocs(collection(db, path));
    const list = snap.docs.map((d) => ({
      ...(d.data() as Omit<FamilyInvitation, 'id'>),
      id: d.id,
    }));
    list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export interface CaseBackupDocument extends CaseDocument {
  dataUrl: string | null;
}

export interface CaseBackupBundle {
  bereavementCase: BereavementCase;
  members: CaseMember[];
  notes: CaseNote[];
  reminders: CaseReminderLog[];
  documents: CaseBackupDocument[];
}

export async function fetchCaseBackupBundleAdmin(
  bereavementCase: BereavementCase,
  includeDocumentPayloads = true
): Promise<CaseBackupBundle> {
  const caseId = bereavementCase.id;
  try {
    const [membersSnap, notesSnap, remindersSnap, docsSnap] = await Promise.all([
      getDocs(collection(db, 'cases', caseId, 'members')),
      getDocs(collection(db, 'cases', caseId, 'notes')),
      getDocs(collection(db, 'cases', caseId, 'reminders')),
      getDocs(collection(db, 'cases', caseId, 'documents')),
    ]);

    const members = membersSnap.docs.map((d) => d.data() as CaseMember);
    const notes = notesSnap.docs.map((d) => ({
      ...(d.data() as Omit<CaseNote, 'id'>),
      id: d.id,
    }));
    const reminders = remindersSnap.docs.map((d) => ({
      ...(d.data() as Omit<CaseReminderLog, 'id'>),
      id: d.id,
    }));

    const documents: CaseBackupDocument[] = await Promise.all(
      docsSnap.docs.map(async (d) => {
        const meta = {
          ...(d.data() as Omit<CaseDocument, 'id'>),
          id: d.id,
        };
        if (!includeDocumentPayloads) {
          return { ...meta, dataUrl: null };
        }
        try {
          const fileSnap = await getDoc(doc(db, 'cases', caseId, 'documents', d.id, 'files', 'payload'));
          const dataUrl = fileSnap.exists()
            ? ((fileSnap.data() as { dataUrl?: string }).dataUrl ?? null)
            : null;
          return { ...meta, dataUrl };
        } catch {
          return { ...meta, dataUrl: null };
        }
      })
    );

    return {
      bereavementCase,
      members,
      notes,
      reminders,
      documents,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `cases/${caseId}`);
  }
}

