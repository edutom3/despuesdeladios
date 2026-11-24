import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { COMUNIDADES_AUTONOMAS, DEFAULT_ANSWERS } from '../data/proceduresCatalog';
import type {
  AnswerChoice,
  BereavementCase,
  MaritalStatusType,
  QuestionnaireAnswers,
  RelationshipType,
} from '../types/domain';

interface QuestionnaireWizardProps {
  initialCase?: BereavementCase | null;
  onCancel: () => void;
  onSave: (payload: {
    deceasedName: string;
    deathDate: string;
    deathPlace: string;
    ccaa: string;
    answers: QuestionnaireAnswers;
  }) => Promise<void>;
}

const YES_NO_OPTIONS: Array<{ value: AnswerChoice; label: string }> = [
  { value: 'si', label: 'Sí' },
  { value: 'no', label: 'No' },
  { value: 'no_se', label: 'No lo sé' },
];

export const QuestionnaireWizard: React.FC<QuestionnaireWizardProps> = ({
  initialCase,
  onCancel,
  onSave,
}) => {
  const [step, setStep] = useState(1);
  const [deceasedName, setDeceasedName] = useState(initialCase?.deceasedName || '');
  const [deathDate, setDeathDate] = useState(
    initialCase?.deathDate || new Date().toISOString().slice(0, 10)
  );
  const [deathPlace, setDeathPlace] = useState(initialCase?.deathPlace || '');
  const [ccaa, setCcaa] = useState(initialCase?.ccaa || 'Madrid');
  const [answers, setAnswers] = useState<QuestionnaireAnswers>(
    initialCase?.answers ? { ...DEFAULT_ANSWERS, ...initialCase.answers } : DEFAULT_ANSWERS
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setAnswer = <K extends keyof QuestionnaireAnswers>(
    field: K,
    value: QuestionnaireAnswers[K]
  ) => {
    setAnswers((prev) => ({ ...prev, [field]: value }));
  };

  const handleNext = () => {
    setError(null);
    if (step === 1) {
      if (!deceasedName.trim()) {
        setError('Escribe el nombre o una referencia de la persona fallecida.');
        return;
      }
      if (!deathDate) {
        setError('Indica la fecha aproximada o exacta del fallecimiento.');
        return;
      }
    }
    setStep((s) => Math.min(4, s + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step !== 4) {
      handleNext();
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave({
        deceasedName: deceasedName.trim(),
        deathDate,
        deathPlace: deathPlace.trim(),
        ccaa,
        answers,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No pudimos guardar el caso. Comprueba tu conexión e inténtalo de nuevo.'
      );
      setSaving(false);
    }
  };

  const renderTriState = (
    label: string,
    hint: string,
    field:
      | 'hasWill'
      | 'hasMinorChildren'
      | 'hasProperty'
      | 'hasRentedHome'
      | 'hasBankAccounts'
      | 'hasVehicle'
      | 'hasDebts'
      | 'receivedPension'
      | 'wasEmployed'
      | 'hasLifeInsurance'
      | 'hasFuneralInsurance'
      | 'hasDigitalAccounts'
  ) => (
    <div className="space-y-2.5">
      <div>
        <p className="text-sm sm:text-base font-medium text-[#1C1E22]">{label}</p>
        {hint && <p className="text-xs text-[#666A73] mt-0.5">{hint}</p>}
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {YES_NO_OPTIONS.map((opt) => {
          const active = answers[field] === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setAnswer(field, opt.value)}
              className={`min-h-[48px] rounded-xl text-sm font-medium border transition-colors ${
                active
                  ? 'bg-[#141518] text-[#F6F4EF] border-[#141518]'
                  : 'bg-white text-[#2E3036] border-[#DDD5C7] hover:bg-[#F5F1EA]'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#1C1E22] flex flex-col">
      <header className="sticky top-0 z-20 bg-[#FAF8F5]/95 backdrop-blur-md border-b border-[#E7E2D8]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] inline-flex items-center gap-2 text-sm font-medium text-[#45484F] hover:text-[#141518]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver</span>
          </button>
          <span className="text-xs font-mono-num text-[#6E6A63]">Paso {step} de 4</span>
        </div>
        <div className="h-1 bg-[#E7E2D8]">
          <div
            className="h-full bg-[#9E7F4E] transition-all duration-200"
            style={{ width: `${(step / 4) * 100}%` }}
          />
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-8">
        <form onSubmit={handleSubmit} className="space-y-8">
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-3xl sm:text-4xl font-semibold text-[#141518]">
                  {initialCase ? 'Editar datos iniciales' : 'Empecemos por lo básico'}
                </h1>
                <p className="mt-2 text-sm sm:text-base text-[#5B5E65]">
                  Con la fecha y la comunidad autónoma calculamos los plazos legales y las notas de
                  tu territorio. Podrás cambiarlo más adelante.
                </p>
              </div>

              <div className="rounded-2xl bg-white border border-[#E7E2D8] p-5 sm:p-6 space-y-5">
                <div>
                  <label htmlFor="deceasedName" className="block text-sm font-medium text-[#1C1E22] mb-1.5">
                    Nombre o referencia de la persona fallecida
                  </label>
                  <input
                    id="deceasedName"
                    type="text"
                    required
                    value={deceasedName}
                    onChange={(e) => setDeceasedName(e.target.value)}
                    placeholder="Ej.: Carmen Ruiz Ortega"
                    className="w-full min-h-[48px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] px-4 text-base text-[#1C1E22] focus:outline-none focus:border-[#8F754B]"
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="deathDate" className="block text-sm font-medium text-[#1C1E22] mb-1.5">
                      Fecha del fallecimiento
                    </label>
                    <input
                      id="deathDate"
                      type="date"
                      required
                      value={deathDate}
                      onChange={(e) => setDeathDate(e.target.value)}
                      className="w-full min-h-[48px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] px-4 text-base text-[#1C1E22] focus:outline-none focus:border-[#8F754B]"
                    />
                  </div>
                  <div>
                    <label htmlFor="deathPlace" className="block text-sm font-medium text-[#1C1E22] mb-1.5">
                      Ciudad o lugar (opcional)
                    </label>
                    <input
                      id="deathPlace"
                      type="text"
                      value={deathPlace}
                      onChange={(e) => setDeathPlace(e.target.value)}
                      placeholder="Ej.: Madrid / Hospital La Paz"
                      className="w-full min-h-[48px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] px-4 text-base text-[#1C1E22] focus:outline-none focus:border-[#8F754B]"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="ccaa" className="block text-sm font-medium text-[#1C1E22] mb-1.5">
                    Comunidad Autónoma donde residía habitualmente
                  </label>
                  <select
                    id="ccaa"
                    value={ccaa}
                    onChange={(e) => setCcaa(e.target.value)}
                    className="w-full min-h-[48px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] px-4 text-base text-[#1C1E22] focus:outline-none focus:border-[#8F754B]"
                  >
                    {COMUNIDADES_AUTONOMAS.map((ca) => (
                      <option key={ca} value={ca}>
                        {ca}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-xs text-[#666A73]">
                    El Impuesto de Sucesiones se presenta según la comunidad de residencia habitual.
                  </p>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-3xl sm:text-4xl font-semibold text-[#141518]">
                  Situación familiar y testamento
                </h1>
                <p className="mt-2 text-sm sm:text-base text-[#5B5E65]">
                  Si no estás seguro de algo, marca «No lo sé» y añadiremos los pasos para
                  comprobarlo.
                </p>
              </div>

              <div className="rounded-2xl bg-white border border-[#E7E2D8] p-5 sm:p-6 space-y-6">
                <div>
                  <label htmlFor="relationship" className="block text-sm font-medium text-[#1C1E22] mb-1.5">
                    ¿Cuál era tu relación con la persona fallecida?
                  </label>
                  <select
                    id="relationship"
                    value={answers.relationship}
                    onChange={(e) => setAnswer('relationship', e.target.value as RelationshipType)}
                    className="w-full min-h-[48px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] px-4 text-base text-[#1C1E22] focus:outline-none focus:border-[#8F754B]"
                  >
                    <option value="conyuge_pareja">Cónyuge o pareja de hecho</option>
                    <option value="hijo_a">Hijo o hija</option>
                    <option value="padre_madre">Padre o madre</option>
                    <option value="hermano_a">Hermano o hermana</option>
                    <option value="otro_familiar">Otro familiar</option>
                    <option value="persona_cercana">Persona cercana o representante</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="maritalStatus" className="block text-sm font-medium text-[#1C1E22] mb-1.5">
                    Estado civil de la persona fallecida
                  </label>
                  <select
                    id="maritalStatus"
                    value={answers.maritalStatus}
                    onChange={(e) =>
                      setAnswer('maritalStatus', e.target.value as MaritalStatusType)
                    }
                    className="w-full min-h-[48px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] px-4 text-base text-[#1C1E22] focus:outline-none focus:border-[#8F754B]"
                  >
                    <option value="casado_a">Casado o casada</option>
                    <option value="pareja_hecho">Pareja de hecho registrada</option>
                    <option value="viudo_a">Viudo o viuda</option>
                    <option value="soltero_a">Soltero o soltera</option>
                    <option value="divorciado_a">Divorciado o separada</option>
                    <option value="no_se">No lo sé</option>
                  </select>
                </div>

                {renderTriState(
                  '¿Sabes si dejó testamento ante notario?',
                  'Si marcas «No lo sé», incluiremos el Certificado de Últimas Voluntades para comprobarlo.',
                  'hasWill'
                )}

                {renderTriState(
                  '¿Tenía hijos menores de edad o personas a su cargo?',
                  'Nos ayuda a incluir trámites escolares, sanitarios o de pensión de orfandad.',
                  'hasMinorChildren'
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-3xl sm:text-4xl font-semibold text-[#141518]">
                  Vivienda, cuentas y bienes
                </h1>
                <p className="mt-2 text-sm sm:text-base text-[#5B5E65]">
                  Solo para saber qué trámites bancarios, de vivienda o de tráfico aplican a este
                  caso.
                </p>
              </div>

              <div className="rounded-2xl bg-white border border-[#E7E2D8] p-5 sm:p-6 space-y-6">
                {renderTriState(
                  '¿Tenía alguna vivienda, local o terreno en propiedad?',
                  'Incluye viviendas compartidas o en gananciales.',
                  'hasProperty'
                )}
                {renderTriState(
                  '¿Vivía en una vivienda de alquiler?',
                  'Hay un plazo de 3 meses para comunicar la subrogación o entrega.',
                  'hasRentedHome'
                )}
                {renderTriState(
                  '¿Tenía cuentas bancarias o tarjetas a su nombre?',
                  'Sirve para solicitar certificados de saldos y desbloquear fondos.',
                  'hasBankAccounts'
                )}
                {renderTriState(
                  '¿Tenía coche, moto u otro vehículo a su nombre?',
                  'La DGT exige notificar quién queda al cuidado en 90 días.',
                  'hasVehicle'
                )}
                {renderTriState(
                  '¿Tenía hipoteca, préstamos o deudas pendientes?',
                  'Si existe duda, conviene valorar la aceptación a beneficio de inventario.',
                  'hasDebts'
                )}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-3xl sm:text-4xl font-semibold text-[#141518]">
                  Pensión, trabajo y seguros
                </h1>
                <p className="mt-2 text-sm sm:text-base text-[#5B5E65]">
                  Último paso. Al pulsar «Guardar», prepararemos tu lista personalizada y el
                  calendario de plazos.
                </p>
              </div>

              <div className="rounded-2xl bg-white border border-[#E7E2D8] p-5 sm:p-6 space-y-6">
                {renderTriState(
                  '¿Cobraba alguna pensión pública (jubilación, viudedad, incapacidad)?',
                  'Permite avisar a la Seguridad Social en el plazo de 30 días.',
                  'receivedPension'
                )}
                {renderTriState(
                  '¿Estaba trabajando por cuenta ajena o como autónomo?',
                  'Incluye la comunicación a la empresa y la solicitud de liquidación.',
                  'wasEmployed'
                )}
                {renderTriState(
                  '¿Tenía algún seguro de vida o vinculado a una hipoteca?',
                  'Aunque no lo sepas, incluiremos el Certificado de Contratos de Seguros.',
                  'hasLifeInsurance'
                )}
                {renderTriState(
                  '¿Contaba con seguro de decesos?',
                  'Suele cubrir los trámites iniciales con la funeraria.',
                  'hasFuneralInsurance'
                )}
                {renderTriState(
                  '¿Tenía líneas de móvil, suscripciones o cuentas digitales?',
                  'Para revisar recibos mensuales y cerrar cuentas de correo o redes.',
                  'hasDigitalAccounts'
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => {
                  setStep((s) => Math.max(1, s - 1));
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="min-h-[48px] px-5 py-2.5 rounded-xl border border-[#D8D0C2] bg-white text-sm font-medium text-[#2A2C30] hover:bg-[#F5F1EA] inline-flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Anterior</span>
              </button>
            ) : (
              <div />
            )}

            {step < 4 ? (
              <button
                type="button"
                onClick={handleNext}
                className="min-h-[48px] px-6 py-2.5 rounded-xl bg-[#141518] text-[#F6F4EF] text-sm font-semibold hover:bg-[#25272D] inline-flex items-center gap-2"
              >
                <span>Siguiente paso</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={saving}
                className="min-h-[48px] px-6 py-2.5 rounded-xl bg-[#8F754B] text-white text-sm font-semibold hover:bg-[#7A633E] inline-flex items-center gap-2 disabled:opacity-60"
              >
                <Check className="w-4 h-4" />
                <span>
                  {saving
                    ? 'Guardando...'
                    : initialCase
                    ? 'Guardar cambios del caso'
                    : 'Guardar mi caso'}
                </span>
              </button>
            )}
          </div>
        </form>
      </main>
    </div>
  );
};
