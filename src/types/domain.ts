export type AnswerChoice = 'si' | 'no' | 'no_se';

export type RelationshipType =
  | 'conyuge_pareja'
  | 'hijo_a'
  | 'padre_madre'
  | 'hermano_a'
  | 'otro_familiar'
  | 'persona_cercana';

export type MaritalStatusType =
  | 'casado_a'
  | 'pareja_hecho'
  | 'soltero_a'
  | 'viudo_a'
  | 'divorciado_a'
  | 'no_se';

export interface QuestionnaireAnswers {
  relationship: RelationshipType;
  maritalStatus: MaritalStatusType;
  hasWill: AnswerChoice;
  hasMinorChildren: AnswerChoice;
  hasProperty: AnswerChoice;
  hasRentedHome: AnswerChoice;
  hasBankAccounts: AnswerChoice;
  hasVehicle: AnswerChoice;
  hasDebts: AnswerChoice;
  receivedPension: AnswerChoice;
  wasEmployed: AnswerChoice;
  hasLifeInsurance: AnswerChoice;
  hasFuneralInsurance: AnswerChoice;
  hasDigitalAccounts: AnswerChoice;
}

export interface TaskState {
  done: boolean;
  doneAt?: string;
  doneByUid?: string;
  doneByName?: string;
  assigneeUid?: string;
  assigneeName?: string;
}

export interface DocState {
  gathered: boolean;
  updatedAt?: string;
  updatedByName?: string;
}

export interface BereavementCase {
  id: string;
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
  deceasedName: string;
  deathDate: string; // YYYY-MM-DD
  deathPlace: string;
  ccaa: string;
  answers: QuestionnaireAnswers;
  unlocked: boolean;
  unlockMethod: 'free' | 'stripe' | 'partner_code';
  unlockCodeUsed?: string;
  memberUids: string[];
  collaboratorUids: string[];
  taskStates: Record<string, TaskState>;
  docStates: Record<string, DocState>;
  reminderEmail?: string;
  reminderEnabled?: boolean;
  reminderDaysBefore?: number;
  reminderOnlyLegal?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CaseMember {
  uid: string;
  email: string;
  displayName: string;
  role: 'owner' | 'collaborate' | 'view';
  inviteCode?: string;
  addedAt: string;
}

export interface CaseNote {
  id: string;
  authorUid: string;
  authorName: string;
  procedureId: string;
  text: string;
  createdAt: string;
}

export interface CaseDocument {
  id: string;
  docTypeKey: string;
  title: string;
  mimeType: string;
  fileSize: number;
  uploadedByUid: string;
  uploadedByName: string;
  extractedDate?: string;
  extractedNumber?: string;
  extractedIssuer?: string;
  extractedSubject?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CaseReminderLog {
  id: string;
  recipientEmail: string;
  triggerType: 'auto' | 'manual_summary' | 'test';
  status: 'sent' | 'simulated_no_api_key' | 'error';
  subject: string;
  procedureIds: string[];
  procedureTitles: string[];
  resendId?: string;
  errorMessage?: string;
  createdByUid: string;
  createdAt: string;
}

export interface FamilyInvitation {
  id: string;
  caseId: string;
  caseTitle: string;
  ownerId: string;
  ownerName: string;
  invitedEmail: string;
  role: 'collaborate' | 'view';
  status: 'pending' | 'accepted' | 'revoked';
  acceptedByUid?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProcedureRules {
  always?: boolean;
  requireAny?: Array<{
    field: keyof QuestionnaireAnswers;
    values: string[];
  }>;
}

export interface RegionalOverride {
  notApplicable?: boolean;
  deadlineUnit?: 'days' | 'months' | 'none';
  deadlineValue?: number;
  whereToDoIt?: string;
  regionalNote?: string;
  extraDocs?: string[];
}

export interface ProcedureCatalogItem {
  id: string;
  title: string;
  summary: string;
  whatIsIt: string;
  whereToDoIt: string;
  consequencesIfSkipped: string;
  requiredDocs: string[];
  deadlineKind: 'legal' | 'recommended' | 'none';
  deadlineUnit: 'days' | 'months' | 'none';
  deadlineValue: number;
  priorityBucket: 'first' | 'months' | 'later';
  sortOrder: number;
  visible: boolean;
  rules: ProcedureRules;
  regionalOverrides: Record<string, RegionalOverride>;
  updatedAt: string;
}

export interface PersonalizedProcedure extends ProcedureCatalogItem {
  effectiveDeadlineDate: string | null; // YYYY-MM-DD
  daysRemaining: number | null;
  urgencyStatus: 'overdue' | 'due_soon' | 'on_track' | 'no_deadline';
  regionalNote?: string;
  effectiveWhereToDoIt: string;
  effectiveRequiredDocs: string[];
  isLockedByPlan: boolean;
}

export interface PartnerCode {
  id: string;
  code: string;
  partnerName: string;
  partnerType: 'funeraria' | 'aseguradora' | 'otro';
  maxUses: number;
  usedCount: number;
  active: boolean;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LegalAlert {
  id: string;
  title: string;
  summary: string;
  effectiveDate: string;
  affectedCcaas: string[];
  affectedProcedureIds: string[];
  severity: 'info' | 'importante';
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProfessionalEntry {
  id: string;
  name: string;
  category: string;
  ccaa: string;
  description: string;
  phone?: string;
  website?: string;
  isPublicService: boolean;
  updatedAt: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  reminderOptIn: boolean;
  reminderDaysBefore: number;
  createdAt: string;
  updatedAt: string;
}
