/**
 * Payload-First Security TDD Test Suite for Después del adiós
 * Documents verification of the "Dirty Dozen" adversarial payloads against firestore.rules.
 */
export const DIRTY_DOZEN_SECURITY_CASES = [
  {
    id: 1,
    name: 'Spoofed ownerId on case create',
    operation: 'create /cases/case_1',
    payload: { ownerId: 'other_uid' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Self-unlocked case on create by non-admin',
    operation: 'create /cases/case_2',
    payload: { unlocked: true, unlockMethod: 'stripe' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Unscoped collection list on /cases',
    operation: 'list /cases',
    payload: {},
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Shadow field injection on /users',
    operation: 'update /users/u1',
    payload: { isAdmin: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'View-only member updating taskStates',
    operation: 'update /cases/case_1',
    payload: { taskStates: { 'cert-defuncion': { done: true } } },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Collaborator escalating unlock or ownerId',
    operation: 'update /cases/case_1',
    payload: { unlocked: true, ownerId: 'collab_uid' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Unverified email claiming admin email',
    operation: 'list /partnerCodes',
    payload: { email: 'edutom3@gmail.com', email_verified: false },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Non-admin listing partnerCodes',
    operation: 'list /partnerCodes',
    payload: {},
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Non-admin modifying procedure catalog',
    operation: 'update /procedures/impuesto-sucesiones',
    payload: { title: 'Modified' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Non-admin publishing legalAlert',
    operation: 'create /legalAlerts/alert_1',
    payload: { published: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Oversized malicious document ID',
    operation: 'get /cases/' + 'a'.repeat(200),
    payload: {},
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'View-role invitee escalating into collaboratorUids',
    operation: 'update /cases/case_1',
    payload: { memberUids: ['owner', 'u2'], collaboratorUids: ['owner', 'u2'] },
    expected: 'PERMISSION_DENIED',
  },
] as const;
