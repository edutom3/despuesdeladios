import type {
  BereavementCase,
  LegalAlert,
  PersonalizedProcedure,
  ProcedureCatalogItem,
  QuestionnaireAnswers,
} from '../types/domain';

export function parseISODate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

export function formatDateES(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Sin fecha fija';
  const d = parseISODate(dateStr);
  if (!d) return dateStr;
  return d.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatShortDateES(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Sin fecha';
  const d = parseISODate(dateStr);
  if (!d) return dateStr;
  return d.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function daysSinceDate(dateStr: string): number {
  const d = parseISODate(dateStr);
  if (!d) return 0;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = today.getTime() - d.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export function addDeadline(
  deathDateStr: string,
  unit: 'days' | 'months' | 'none',
  value: number
): string | null {
  if (unit === 'none' || value <= 0) return null;
  const base = parseISODate(deathDateStr);
  if (!base) return null;
  const target = new Date(base.getTime());
  if (unit === 'days') {
    target.setDate(target.getDate() + value);
  } else if (unit === 'months') {
    target.setMonth(target.getMonth() + value);
  }
  const yyyy = target.getFullYear();
  const mm = String(target.getMonth() + 1).padStart(2, '0');
  const dd = String(target.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function daysUntilDate(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = parseISODate(dateStr);
  if (!target) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function matchesProcedureRules(
  proc: ProcedureCatalogItem,
  answers: QuestionnaireAnswers
): boolean {
  if (!proc.visible) return false;
  if (proc.rules.always) return true;
  if (!proc.rules.requireAny || proc.rules.requireAny.length === 0) return true;
  return proc.rules.requireAny.some((cond) => {
    const val = answers[cond.field];
    return cond.values.includes(val);
  });
}

export const FREE_PLAN_LIMIT = 0;

export function buildPersonalizedProcedures(
  bereavementCase: BereavementCase,
  catalog: ProcedureCatalogItem[]
): PersonalizedProcedure[] {
  const { answers, ccaa, deathDate, unlocked } = bereavementCase;

  const matched = catalog
    .filter((proc) => matchesProcedureRules(proc, answers))
    .map((proc): PersonalizedProcedure | null => {
      const override = proc.regionalOverrides?.[ccaa];
      if (override?.notApplicable) return null;

      const effectiveUnit = override?.deadlineUnit ?? proc.deadlineUnit;
      const effectiveValue = override?.deadlineValue ?? proc.deadlineValue;
      const effectiveDeadlineDate = addDeadline(deathDate, effectiveUnit, effectiveValue);
      const daysRemaining = daysUntilDate(effectiveDeadlineDate);

      let urgencyStatus: PersonalizedProcedure['urgencyStatus'] = 'no_deadline';
      if (daysRemaining !== null) {
        if (daysRemaining < 0) urgencyStatus = 'overdue';
        else if (daysRemaining <= 14) urgencyStatus = 'due_soon';
        else urgencyStatus = 'on_track';
      }

      const effectiveWhereToDoIt = override?.whereToDoIt || proc.whereToDoIt;
      const extraDocs = override?.extraDocs || [];
      const effectiveRequiredDocs = Array.from(new Set([...proc.requiredDocs, ...extraDocs]));

      return {
        ...proc,
        effectiveDeadlineDate,
        daysRemaining,
        urgencyStatus,
        regionalNote: override?.regionalNote,
        effectiveWhereToDoIt,
        effectiveRequiredDocs,
        isLockedByPlan: false,
      };
    })
    .filter((item): item is PersonalizedProcedure => item !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // Paid-only model: no procedures are unlocked until the case is activated
  if (!unlocked) {
    return matched.map((proc, index) => ({
      ...proc,
      isLockedByPlan: index >= FREE_PLAN_LIMIT,
    }));
  }

  return matched;
}

export interface AggregatedRequiredDoc {
  docKey: string;
  label: string;
  procedureIds: string[];
  procedureTitles: string[];
}

export function normalizeDocKey(label: string): string {
  return label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

export function aggregateRequiredDocuments(
  procedures: PersonalizedProcedure[]
): AggregatedRequiredDoc[] {
  const map = new Map<string, AggregatedRequiredDoc>();
  for (const proc of procedures) {
    for (const label of proc.effectiveRequiredDocs) {
      const docKey = normalizeDocKey(label);
      const existing = map.get(docKey);
      if (existing) {
        if (!existing.procedureIds.includes(proc.id)) {
          existing.procedureIds.push(proc.id);
          existing.procedureTitles.push(proc.title);
        }
      } else {
        map.set(docKey, {
          docKey,
          label,
          procedureIds: [proc.id],
          procedureTitles: [proc.title],
        });
      }
    }
  }
  return Array.from(map.values());
}

export function getMatchingLegalAlerts(
  bereavementCase: BereavementCase,
  procedures: PersonalizedProcedure[],
  alerts: LegalAlert[]
): LegalAlert[] {
  const procIds = new Set(procedures.map((p) => p.id));
  return alerts.filter((alert) => {
    if (!alert.published) return false;
    const matchesCcaa =
      alert.affectedCcaas.includes('Todas') || alert.affectedCcaas.includes(bereavementCase.ccaa);
    const matchesProc =
      alert.affectedProcedureIds.length === 0 ||
      alert.affectedProcedureIds.some((id) => procIds.has(id));
    return matchesCcaa && matchesProc;
  });
}

export function summarizeAnswersES(answers: QuestionnaireAnswers): string {
  const relMap: Record<QuestionnaireAnswers['relationship'], string> = {
    conyuge_pareja: 'Cónyuge o pareja',
    hijo_a: 'Hijo/a',
    padre_madre: 'Padre o madre',
    hermano_a: 'Hermano/a',
    otro_familiar: 'Otro familiar',
    persona_cercana: 'Persona allegada',
  };
  const yn = (v: string) => (v === 'si' ? 'Sí' : v === 'no' ? 'No' : 'No lo sé');
  return [
    `Parentesco: ${relMap[answers.relationship]}`,
    `Testamento: ${yn(answers.hasWill)}`,
    `Hijos menores: ${yn(answers.hasMinorChildren)}`,
    `Vivienda en propiedad: ${yn(answers.hasProperty)}`,
    `Alquiler: ${yn(answers.hasRentedHome)}`,
    `Cuentas bancarias: ${yn(answers.hasBankAccounts)}`,
    `Vehículo: ${yn(answers.hasVehicle)}`,
    `Deudas/hipoteca: ${yn(answers.hasDebts)}`,
    `Pensión: ${yn(answers.receivedPension)}`,
    `Trabajaba: ${yn(answers.wasEmployed)}`,
    `Seguro de vida: ${yn(answers.hasLifeInsurance)}`,
    `Seguro de decesos: ${yn(answers.hasFuneralInsurance)}`,
  ].join(' · ');
}
