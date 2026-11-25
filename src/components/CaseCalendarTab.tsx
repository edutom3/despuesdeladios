import React, { useState } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import type { BereavementCase, PersonalizedProcedure } from '../types/domain';
import { formatDateES, parseISODate } from '../utils/caseEngine';
import { downloadCaseCalendarICS } from '../utils/icsExport';

interface CaseCalendarTabProps {
  bereavementCase: BereavementCase;
  procedures: PersonalizedProcedure[];
  onSelectProcedure: (proc: PersonalizedProcedure) => void;
  onOpenUnlock: () => void;
}

const WEEKDAYS_ES = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export const CaseCalendarTab: React.FC<CaseCalendarTabProps> = ({
  bereavementCase,
  procedures,
  onSelectProcedure,
  onOpenUnlock,
}) => {
  const initialDate = parseISODate(bereavementCase.deathDate) || new Date();
  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth()); // 0..11
  const [includeCompleted, setIncludeCompleted] = useState(true);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const visibleProcedures = procedures.filter((p) => !p.isLockedByPlan);
  const lockedCount = procedures.length - visibleProcedures.length;
  const datedCount = visibleProcedures.filter((p) => Boolean(p.effectiveDeadlineDate)).length;
  const pendingDatedCount = visibleProcedures.filter(
    (p) => Boolean(p.effectiveDeadlineDate) && !bereavementCase.taskStates[p.id]?.done
  ).length;
  const targetExportCount = includeCompleted ? datedCount : pendingDatedCount;

  const handleExportICS = () => {
    const res = downloadCaseCalendarICS(bereavementCase, procedures, { includeCompleted });
    if (res.exportedCount === 0) {
      setExportNotice(
        'No hay trámites pendientes con fecha fija para exportar. Marca «Incluir ya hechos» si quieres incluir los completados.'
      );
      return;
    }
    setExportNotice(
      `Archivo ${res.filename} descargado con ${res.exportedCount} ${
        res.exportedCount === 1 ? 'plazo' : 'plazos'
      }. Ábrelo en tu dispositivo para añadirlo a Apple Calendar o impórtalo en Google Calendar (Configuración → Importar y exportar).`
    );
  };

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString('es-ES', {
    month: 'long',
    year: 'numeric',
  });

  const firstDay = new Date(viewYear, viewMonth, 1);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  // Monday=0 .. Sunday=6
  const startOffset = (firstDay.getDay() + 6) % 7;

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const monthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;
  const monthProcedures = visibleProcedures.filter((p) =>
    p.effectiveDeadlineDate?.startsWith(monthPrefix)
  );
  const unscheduledProcedures = visibleProcedures.filter((p) => !p.effectiveDeadlineDate);

  const getDotColor = (status: PersonalizedProcedure['urgencyStatus'], done?: boolean) => {
    if (done) return 'bg-emerald-600';
    if (status === 'overdue') return 'bg-red-600';
    if (status === 'due_soon') return 'bg-amber-500';
    return 'bg-[#8F754B]';
  };

  return (
    <div className="space-y-6">
      {lockedCount > 0 && (
        <div className="rounded-2xl border border-[#D6C3A5] bg-[#F7F2E8] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs sm:text-sm text-[#4F3D22]">
            El calendario completo de plazos ({lockedCount} trámites) se habilita al activar el
            caso.
          </p>
          <button
            type="button"
            onClick={onOpenUnlock}
            className="min-h-[40px] px-4 rounded-xl bg-[#141518] text-[#F6F4EF] text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
          >
            <Lock className="w-3.5 h-3.5 text-[#D6C3A5]" />
            <span>Activar caso</span>
          </button>
        </div>
      )}

      {/* ICS Calendar Export Bar */}
      {datedCount > 0 && (
        <div className="rounded-2xl bg-white border border-[#E7E2D8] p-4 sm:p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-[#141518]">
                Llevar plazos a Google Calendar o Apple Calendar
              </h2>
              <p className="text-xs text-[#666A73] font-mono-num">
                {targetExportCount} {targetExportCount === 1 ? 'trámite con fecha' : 'trámites con fecha'}{' '}
                listo para exportar en formato .ics con recordatorios incluidos
                {unscheduledProcedures.length > 0
                  ? ` · ${unscheduledProcedures.length} sin fecha fija`
                  : ''}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <label className="inline-flex items-center gap-2 text-xs text-[#45484F] cursor-pointer min-h-[40px] px-1">
                <input
                  type="checkbox"
                  checked={includeCompleted}
                  onChange={(e) => {
                    setIncludeCompleted(e.target.checked);
                    setExportNotice(null);
                  }}
                  className="w-4 h-4 accent-[#8F754B]"
                />
                <span>Incluir ya hechos</span>
              </label>

              <button
                type="button"
                onClick={handleExportICS}
                disabled={targetExportCount === 0}
                className="min-h-[44px] px-4 rounded-xl bg-[#141518] text-[#F6F4EF] text-xs sm:text-sm font-semibold hover:bg-[#25272D] transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                <CalendarPlus className="w-4 h-4 text-[#D6C3A5]" />
                <span>Exportar calendario (.ics)</span>
              </button>
            </div>
          </div>

          {exportNotice && (
            <p className="rounded-xl border border-[#D6C3A5] bg-[#FAF7F1] px-3.5 py-2.5 text-xs text-[#4F3D22] leading-relaxed">
              {exportNotice}
            </p>
          )}
        </div>
      )}

      {/* Month Grid */}
      <div className="rounded-2xl bg-white border border-[#E7E2D8] p-5">
        <div className="flex items-center justify-between gap-4 mb-5">
          <button
            type="button"
            onClick={prevMonth}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-[#E7E2D8] hover:bg-[#F5F1EA]"
            aria-label="Mes anterior"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="font-display text-2xl sm:text-3xl font-semibold capitalize text-[#141518]">
            {monthLabel}
          </h2>
          <button
            type="button"
            onClick={nextMonth}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-[#E7E2D8] hover:bg-[#F5F1EA]"
            aria-label="Mes siguiente"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-[#7A7D85] mb-2">
          {WEEKDAYS_ES.map((w) => (
            <div key={w} className="py-1">
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: startOffset }).map((_, idx) => (
            <div key={`empty-${idx}`} className="h-12 sm:h-14" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, idx) => {
            const dayNum = idx + 1;
            const dateStr = `${monthPrefix}-${String(dayNum).padStart(2, '0')}`;
            const dayProcs = monthProcedures.filter((p) => p.effectiveDeadlineDate === dateStr);
            const isDeathDay = bereavementCase.deathDate === dateStr;

            return (
              <div
                key={dateStr}
                className={`h-12 sm:h-14 rounded-xl border p-1.5 flex flex-col justify-between items-center ${
                  dayProcs.length > 0
                    ? 'border-[#CBBCA2] bg-[#FAF7F1]'
                    : isDeathDay
                    ? 'border-[#141518]/30 bg-[#F2EFE9]'
                    : 'border-transparent'
                }`}
              >
                <span className="text-xs font-mono-num text-[#1C1E22]">{dayNum}</span>
                {dayProcs.length > 0 && (
                  <div className="flex items-center gap-1">
                    {dayProcs.slice(0, 3).map((p) => (
                      <span
                        key={p.id}
                        className={`w-2 h-2 rounded-full ${getDotColor(
                          p.urgencyStatus,
                          bereavementCase.taskStates[p.id]?.done
                        )}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 pt-3 border-t border-[#EFECE5] flex flex-wrap gap-4 text-xs text-[#5B5E65]">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600" /> Pasado de fecha
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Vence en 14 días
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#8F754B]" /> En plazo
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" /> Hecho
          </span>
        </div>
      </div>

      {/* Month's Deadlines List */}
      <div className="rounded-2xl bg-white border border-[#E7E2D8] p-5 space-y-3">
        <h3 className="font-display text-2xl font-semibold text-[#141518]">
          Plazos en {monthLabel}
        </h3>
        {monthProcedures.length === 0 ? (
          <p className="text-sm text-[#666A73]">
            No hay vencimientos calculados en este mes. Usa las flechas para revisar los meses
            siguientes.
          </p>
        ) : (
          <div className="divide-y divide-[#EFECE5]">
            {monthProcedures.map((proc) => {
              const done = Boolean(bereavementCase.taskStates[proc.id]?.done);
              return (
                <button
                  key={proc.id}
                  type="button"
                  onClick={() => onSelectProcedure(proc)}
                  className="w-full py-3.5 text-left flex items-center justify-between gap-4 hover:bg-[#FAF8F5] px-2 rounded-lg transition-colors"
                >
                  <div>
                    <p
                      className={`text-sm font-medium ${
                        done ? 'line-through text-[#7A7D85]' : 'text-[#141518]'
                      }`}
                    >
                      {proc.title}
                    </p>
                    <p className="text-xs text-[#666A73] mt-0.5 font-mono-num">
                      {formatDateES(proc.effectiveDeadlineDate)} ·{' '}
                      {proc.deadlineKind === 'legal' ? 'Plazo legal' : 'Fecha orientativa'}
                    </p>
                  </div>
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${getDotColor(
                      proc.urgencyStatus,
                      done
                    )}`}
                  />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {unscheduledProcedures.length > 0 && (
        <div className="rounded-2xl bg-white border border-[#E7E2D8] p-5 space-y-3">
          <h3 className="text-sm font-semibold text-[#141518]">Trámites sin fecha límite fija</h3>
          <div className="divide-y divide-[#EFECE5]">
            {unscheduledProcedures.map((proc) => (
              <button
                key={proc.id}
                type="button"
                onClick={() => onSelectProcedure(proc)}
                className="w-full py-3 text-left text-sm text-[#2E3036] hover:text-[#141518] flex items-center justify-between"
              >
                <span>{proc.title}</span>
                <span className="text-xs text-[#7A7D85]">Abrir ficha</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
