import type {
  BereavementCase,
  LegalAlert,
  ProcedureCatalogItem,
  ProfessionalEntry,
} from '../types/domain';

const CACHE_PREFIX = 'dda_offline_v1_';

export function saveOfflineSnapshot(uid: string, key: string, value: unknown): void {
  try {
    localStorage.setItem(`${CACHE_PREFIX}${uid}_${key}`, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors cleanly
  }
}

export function loadOfflineSnapshot<T>(uid: string, key: string): T | null {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${uid}_${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveGlobalCatalogSnapshot(
  procedures: ProcedureCatalogItem[],
  alerts: LegalAlert[],
  professionals: ProfessionalEntry[]
): void {
  try {
    localStorage.setItem(`${CACHE_PREFIX}catalog_procedures`, JSON.stringify(procedures));
    localStorage.setItem(`${CACHE_PREFIX}catalog_alerts`, JSON.stringify(alerts));
    localStorage.setItem(`${CACHE_PREFIX}catalog_professionals`, JSON.stringify(professionals));
  } catch {
    // Ignore quota errors
  }
}

export function loadGlobalCatalogSnapshot(): {
  procedures: ProcedureCatalogItem[] | null;
  alerts: LegalAlert[] | null;
  professionals: ProfessionalEntry[] | null;
} {
  try {
    const p = localStorage.getItem(`${CACHE_PREFIX}catalog_procedures`);
    const a = localStorage.getItem(`${CACHE_PREFIX}catalog_alerts`);
    const pr = localStorage.getItem(`${CACHE_PREFIX}catalog_professionals`);
    return {
      procedures: p ? (JSON.parse(p) as ProcedureCatalogItem[]) : null,
      alerts: a ? (JSON.parse(a) as LegalAlert[]) : null,
      professionals: pr ? (JSON.parse(pr) as ProfessionalEntry[]) : null,
    };
  } catch {
    return { procedures: null, alerts: null, professionals: null };
  }
}

export function saveCasesSnapshot(uid: string, cases: BereavementCase[]): void {
  saveOfflineSnapshot(uid, 'cases', cases);
}

export function loadCasesSnapshot(uid: string): BereavementCase[] {
  return loadOfflineSnapshot<BereavementCase[]>(uid, 'cases') || [];
}
