import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ChevronDown,
  HelpCircle,
  Search,
  X,
} from 'lucide-react';
import {
  FAQ_CATEGORIES,
  LEGAL_FAQ_ITEMS,
  resolveFaqContext,
  type ContextualFaqItem,
  type FaqCategory,
} from '../data/legalFaqData';
import type { BereavementCase } from '../types/domain';
import { daysSinceDate } from '../utils/caseEngine';

interface LegalFaqDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Optional list of user cases when opened from the main Mis Casos dashboard */
  cases?: BereavementCase[];
  /** Currently focused case (e.g. from CaseWorkspace or selected in drawer) */
  activeCase?: BereavementCase | null;
  /** Optional handler to jump directly to a procedure inside CaseWorkspace */
  onOpenProcedure?: (procedureId: string) => void;
}

export const LegalFaqDrawer: React.FC<LegalFaqDrawerProps> = ({
  open,
  onClose,
  cases = [],
  activeCase = null,
  onOpenProcedure,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<FaqCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string>(
    activeCase?.id || cases[0]?.id || ''
  );

  useEffect(() => {
    if (activeCase?.id) {
      setSelectedCaseId(activeCase.id);
    } else if (cases.length > 0 && !cases.some((c) => c.id === selectedCaseId)) {
      setSelectedCaseId(cases[0].id);
    }
  }, [activeCase?.id, cases, selectedCaseId]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const contextCase = useMemo(() => {
    if (activeCase) return activeCase;
    if (!selectedCaseId) return null;
    return cases.find((c) => c.id === selectedCaseId) || null;
  }, [activeCase, cases, selectedCaseId]);

  const enrichedItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return LEGAL_FAQ_ITEMS.map((item) => ({
      item,
      contextMatch: resolveFaqContext(item, contextCase),
    }))
      .filter(({ item }) => {
        const okCat = selectedCategory === 'all' || item.category === selectedCategory;
        if (!okCat) return false;
        if (!q) return true;
        const haystack = [
          item.question,
          item.shortAnswer,
          item.categoryLabel,
          item.timeframeHint,
          ...item.steps,
          item.importantNote || '',
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => {
        const aMatch = a.contextMatch ? 1 : 0;
        const bMatch = b.contextMatch ? 1 : 0;
        return bMatch - aMatch;
      });
  }, [contextCase, selectedCategory, searchQuery]);

  // Auto-open the first relevant FAQ when opening if none is expanded yet
  useEffect(() => {
    if (open && !expandedId && enrichedItems.length > 0) {
      setExpandedId(enrichedItems[0].item.id);
    }
  }, [open, expandedId, enrichedItems]);

  if (!open) return null;

  const contextualCount = enrichedItems.filter((e) => Boolean(e.contextMatch)).length;
  const daysElapsed = contextCase ? daysSinceDate(contextCase.deathDate) : null;

  const renderFaqCard = (
    item: ContextualFaqItem,
    contextMatch: { matches: boolean; reason: string } | null
  ) => {
    const isExpanded = expandedId === item.id;
    return (
      <div
        key={item.id}
        className={`rounded-2xl border bg-white transition-colors ${
          isExpanded ? 'border-[#CBBCA2]' : 'border-[#E7E2D8] hover:border-[#D6C8B2]'
        }`}
      >
        <button
          type="button"
          onClick={() => setExpandedId(isExpanded ? null : item.id)}
          aria-expanded={isExpanded}
          className="w-full text-left p-4 sm:p-5 flex items-start justify-between gap-3 min-h-[48px] focus-visible:outline-2 focus-visible:outline-[#8F754B] rounded-2xl"
        >
          <div className="min-w-0 flex-1">
            <p className="text-xs text-[#6E6A63]">
              <span>{item.categoryLabel}</span>
              <span aria-hidden="true"> · </span>
              <span className="font-mono-num">{item.timeframeHint}</span>
              {contextMatch && (
                <>
                  <span aria-hidden="true"> · </span>
                  <span className="text-[#7D633A] font-medium">{contextMatch.reason}</span>
                </>
              )}
            </p>
            <h3 className="mt-1.5 text-sm sm:text-base font-semibold text-[#141518] leading-snug">
              {item.question}
            </h3>
          </div>
          <ChevronDown
            className={`w-5 h-5 text-[#7A7D85] shrink-0 mt-1 transition-transform duration-200 ${
              isExpanded ? 'rotate-180 text-[#8F754B]' : ''
            }`}
          />
        </button>

        {isExpanded && (
          <div className="px-4 sm:px-5 pb-5 pt-1 border-t border-[#F0ECE3] space-y-3.5">
            <p className="text-sm text-[#1C1E22] leading-relaxed">{item.shortAnswer}</p>

            <ul className="space-y-2 text-xs sm:text-sm text-[#45484F] leading-relaxed">
              {item.steps.map((step, idx) => (
                <li key={idx} className="flex items-start gap-2.5">
                  <span className="font-mono-num text-xs font-semibold text-[#8F754B] mt-0.5 shrink-0">
                    {idx + 1}.
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ul>

            {item.importantNote && (
              <p className="rounded-xl bg-[#FAF8F5] border border-[#E7E2D8] px-3.5 py-2.5 text-xs text-[#4F3D22] leading-relaxed">
                <strong>A tener en cuenta:</strong> {item.importantNote}
              </p>
            )}

            {item.relatedProcedureId && onOpenProcedure && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onOpenProcedure(item.relatedProcedureId!);
                    onClose();
                  }}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] text-xs font-semibold text-[#7D633A] hover:bg-[#EFECE5] inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <span>Ir a este trámite en el caso</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/55 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="faq-drawer-title"
      onClick={onClose}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-xl h-full bg-[#FAF8F5] text-[#1C1E22] border-l border-[#E7E2D8] shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-[#E7E2D8] bg-white flex items-start justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <p className="text-xs text-[#7D633A] inline-flex items-center gap-1.5 font-medium">
              <HelpCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Orientación práctica tras un fallecimiento</span>
            </p>
            <h2
              id="faq-drawer-title"
              className="font-display text-2xl sm:text-3xl font-semibold text-[#141518] mt-0.5 leading-tight"
            >
              Preguntas frecuentes
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#45484F] hover:bg-[#FAF8F5] shrink-0"
            aria-label="Cerrar panel de preguntas frecuentes"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contextual Case Selector & Search Controls */}
        <div className="px-5 sm:px-6 py-4 border-b border-[#E7E2D8] bg-white/80 space-y-3 shrink-0">
          {!activeCase && cases.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label
                htmlFor="faqCaseSelect"
                className="text-xs font-medium text-[#45484F] whitespace-nowrap"
              >
                Adaptar respuestas a:
              </label>
              <select
                id="faqCaseSelect"
                value={selectedCaseId}
                onChange={(e) => setSelectedCaseId(e.target.value)}
                className="min-h-[40px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] px-3 text-xs sm:text-sm text-[#141518] flex-1 sm:max-w-xs"
              >
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.deceasedName} ({c.ccaa})
                  </option>
                ))}
                <option value="">Ver guía general (sin caso)</option>
              </select>
            </div>
          )}

          {contextCase && (
            <p className="text-xs text-[#5B5E65] leading-relaxed">
              Mostrando primero{' '}
              <strong className="text-[#141518]">
                {contextualCount}{' '}
                {contextualCount === 1 ? 'duda relacionada' : 'dudas relacionadas'}
              </strong>{' '}
              con el caso de <strong>{contextCase.deceasedName}</strong> ({contextCase.ccaa}
              {daysElapsed !== null ? ` · hace ${daysElapsed} días` : ''}).
            </p>
          )}

          <div className="relative">
            <Search className="w-4 h-4 text-[#7A7D85] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar duda (ej. testamento, prórroga, banco, deudas)..."
              className="w-full min-h-[44px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] pl-10 pr-4 text-sm text-[#141518] placeholder:text-[#7A7D85] focus:outline-none focus:border-[#8F754B]"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {FAQ_CATEGORIES.map((cat) => {
              const active = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#141518] text-[#F6F4EF]'
                      : 'bg-[#EFECE5] text-[#45484F] hover:bg-[#E5E0D5]'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable FAQ Accordion List */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-3">
          {enrichedItems.length === 0 ? (
            <div className="rounded-2xl border border-[#E7E2D8] bg-white p-6 text-center space-y-3">
              <p className="text-sm font-medium text-[#141518]">
                No hay ninguna pregunta que coincida con esa búsqueda.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                }}
                className="min-h-[40px] px-4 rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] text-xs font-medium text-[#45484F] hover:bg-[#EFECE5]"
              >
                Ver todas las preguntas
              </button>
            </div>
          ) : (
            enrichedItems.map(({ item, contextMatch }) => renderFaqCard(item, contextMatch))
          )}
        </div>

        {/* Calm Non-Legal-Advice Footer */}
        <div className="px-5 sm:px-6 py-3.5 border-t border-[#E7E2D8] bg-white text-xs text-[#5B5E65] leading-relaxed shrink-0">
          «Después del adiós» es una herramienta informativa y de organización. Estas respuestas son
          orientativas y no sustituyen el asesoramiento jurídico, fiscal o notarial profesional.
        </div>
      </aside>
    </div>
  );
};
