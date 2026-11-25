import type { BereavementCase } from '../types/domain';
import { daysSinceDate } from '../utils/caseEngine';

export type FaqCategory =
  | 'all'
  | 'primeros_dias'
  | 'herencia'
  | 'impuestos'
  | 'bancos_pensiones'
  | 'vivienda_deudas';

export interface ContextualFaqItem {
  id: string;
  category: Exclude<FaqCategory, 'all'>;
  categoryLabel: string;
  timeframeHint: string;
  question: string;
  shortAnswer: string;
  steps: string[];
  importantNote?: string;
  relatedProcedureId?: string;
  getContextMatch?: (
    bereavementCase: BereavementCase,
    daysElapsed: number
  ) => { matches: boolean; reason: string } | null;
}

export const FAQ_CATEGORIES: Array<{ id: FaqCategory; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'primeros_dias', label: 'Primeros días' },
  { id: 'herencia', label: 'Herencia y testamento' },
  { id: 'impuestos', label: 'Impuestos y plazos' },
  { id: 'bancos_pensiones', label: 'Bancos y pensiones' },
  { id: 'vivienda_deudas', label: 'Vivienda y deudas' },
];

export const LEGAL_FAQ_ITEMS: ContextualFaqItem[] = [
  {
    id: 'faq-primeros-papeles',
    category: 'primeros_dias',
    categoryLabel: 'Primeros días',
    timeframeHint: 'Primeras 24-72 horas',
    question: '¿Qué es lo primero que hay que tramitar en los primeros días?',
    shortAnswer:
      'Lo urgente al principio es obtener el certificado médico de defunción, inscribir el fallecimiento en el Registro Civil y tramitar la licencia de entierro o incineración. Casi siempre la funeraria o el seguro de decesos gestiona estos primeros pasos por vosotros.',
    steps: [
      'Aseguraos de que el médico firma el certificado médico de defunción y entregadlo a la funeraria si la hay.',
      'Inscribid el fallecimiento en el Registro Civil del municipio donde ocurrió (o confirmad que lo hace la funeraria).',
      'Si existe seguro de decesos o de vida, avisad a la compañía en un plazo orientativo de 7 días.',
    ],
    relatedProcedureId: 'inscripcion-registro-civil',
    getContextMatch: (_c, days) =>
      days <= 14
        ? { matches: true, reason: `Fallecimiento reciente (hace ${days} días)` }
        : null,
  },
  {
    id: 'faq-copias-certificado',
    category: 'primeros_dias',
    categoryLabel: 'Primeros días',
    timeframeHint: 'Primera semana',
    question: '¿Cuántas copias del certificado de defunción conviene pedir?',
    shortAnswer:
      'Es muy útil solicitar desde el principio entre 4 y 5 copias literales del certificado de defunción, porque bancos, aseguradoras, Seguridad Social y notaría os pedirán una copia original o cotejada.',
    steps: [
      'Es un trámite gratuito en el Registro Civil y también se puede pedir por internet con certificado digital o Cl@ve.',
      'Pide siempre «certificado literal de defunción», no solo un extracto simple, para evitar que algún organismo lo rechace.',
    ],
    relatedProcedureId: 'inscripcion-registro-civil',
    getContextMatch: (c) =>
      !c.taskStates['inscripcion-registro-civil']?.done
        ? { matches: true, reason: 'Trámite inicial aún pendiente' }
        : null,
  },
  {
    id: 'faq-ultimas-voluntades',
    category: 'primeros_dias',
    categoryLabel: 'Primeros días',
    timeframeHint: 'Esperar 15 días hábiles',
    question: '¿Cuándo y para qué se pide el Certificado de Últimas Voluntades?',
    shortAnswer:
      'Sirve para saber con certeza si la persona fallecida otorgó testamento y ante qué notario lo hizo. Por ley hay que esperar 15 días hábiles (sin contar sábados, domingos ni festivos) desde el fallecimiento para solicitarlo.',
    steps: [
      'Se solicita ante el Ministerio de Justicia (presencialmente, por correo o por sede electrónica) pagando la tasa modelo 790.',
      'En el mismo trámite suele pedirse también el Certificado de Contratos de Seguros de cobertura de fallecimiento.',
    ],
    importantNote: 'No se puede expedir antes de que pasen esos 15 días hábiles.',
    relatedProcedureId: 'certificado-ultimas-voluntades',
    getContextMatch: (c, days) => {
      if (days <= 45 || c.answers.hasWill === 'no_se') {
        return {
          matches: true,
          reason:
            c.answers.hasWill === 'no_se'
              ? 'No sabéis si hay testamento'
              : 'Plazo clave de las primeras semanas',
        };
      }
      return null;
    },
  },
  {
    id: 'faq-seguros-ocultos',
    category: 'primeros_dias',
    categoryLabel: 'Primeros días',
    timeframeHint: 'Desde los 15 días hábiles',
    question: '¿Cómo podemos saber si tenía algún seguro de vida o de accidentes?',
    shortAnswer:
      'Solicitando el Certificado de Contratos de Seguros de cobertura de fallecimiento ante el Ministerio de Justicia, una vez transcurridos 15 días hábiles desde la defunción.',
    steps: [
      'Este registro oficial muestra todas las pólizas de vida o accidentes vigentes asociadas al DNI del fallecido (incluidos seguros vinculados a hipotecas o tarjetas).',
      'Con ese certificado, podéis acudir directamente a cada aseguradora indicada para reclamar la prestación.',
    ],
    relatedProcedureId: 'certificado-contratos-seguros',
    getContextMatch: (c) =>
      c.answers.hasLifeInsurance === 'si' || c.answers.hasLifeInsurance === 'no_se'
        ? { matches: true, reason: 'Seguros de vida o decesos por comprobar' }
        : null,
  },
  {
    id: 'faq-sin-testamento',
    category: 'herencia',
    categoryLabel: 'Herencia y testamento',
    timeframeHint: 'Tras Últimas Voluntades',
    question: '¿Qué pasa si falleció sin haber hecho testamento?',
    shortAnswer:
      'No se pierde la herencia: simplemente la ley determina quiénes son los herederos (hijos, cónyuge, padres o hermanos según el caso y la comunidad autónoma) mediante un acta notarial llamada Declaración de Herederos Abintestato.',
    steps: [
      'Se tramita en una notaría aportando el certificado de defunción, Últimas Voluntades, libro de familia o certificados de nacimiento y empadronamiento.',
      'Tendrán que acudir dos testigos mayores de edad que conocieran a la familia pero no tengan interés directo en la herencia.',
      'Tras firmar el acta, la ley exige esperar 20 días hábiles antes de poder repartir formalmente los bienes.',
    ],
    relatedProcedureId: 'declaracion-herederos-abintestato',
    getContextMatch: (c) =>
      c.answers.hasWill === 'no' || c.answers.hasWill === 'no_se'
        ? { matches: true, reason: 'Caso sin testamento o por confirmar' }
        : null,
  },
  {
    id: 'faq-copia-testamento',
    category: 'herencia',
    categoryLabel: 'Herencia y testamento',
    timeframeHint: 'Tras Últimas Voluntades',
    question: 'Si hay testamento, ¿cómo conseguimos una copia válida?',
    shortAnswer:
      'Aunque tengáis una copia simple en casa, para bancos y trámites legales necesitaréis una «copia autorizada» expedida por la notaría donde se firmó el último testamento (o la notaría que conserve su protocolo si el notario se jubiló).',
    steps: [
      'En el Certificado de Últimas Voluntades aparecerá la fecha y el nombre del notario del último testamento válido.',
      'Contactad con esa notaría llevando el certificado de defunción, el de Últimas Voluntades y el DNI del familiar con derecho a solicitarlo.',
    ],
    relatedProcedureId: 'copia-autorizada-testamento',
    getContextMatch: (c) =>
      c.answers.hasWill === 'si'
        ? { matches: true, reason: 'Consta que existe testamento' }
        : null,
  },
  {
    id: 'faq-herencia-notario',
    category: 'herencia',
    categoryLabel: 'Herencia y testamento',
    timeframeHint: 'Antes de los 6 meses',
    question: '¿Es siempre obligatorio hacer escritura de herencia ante notario?',
    shortAnswer:
      'Si hay vivienda, terrenos o varios bienes a repartir, sí hace falta escritura notarial para poder inscribirlos en el Registro de la Propiedad. Si no hay inmuebles y solo hay saldos bancarios, a veces basta un documento privado con el impuesto liquidado, aunque depende de cada banco y si hay acuerdo entre todos.',
    steps: [
      'Si existe un inmueble en propiedad, la escritura de aceptación y adjudicación de herencia es imprescindible.',
      'Conviene pedir cita en notaría con margen suficiente antes de que venza el plazo de 6 meses del Impuesto de Sucesiones.',
    ],
    relatedProcedureId: 'escritura-aceptacion-adjudicacion-herencia',
    getContextMatch: (c) =>
      c.answers.hasProperty === 'si'
        ? { matches: true, reason: 'Hay vivienda o bienes inmuebles en propiedad' }
        : null,
  },
  {
    id: 'faq-menores',
    category: 'herencia',
    categoryLabel: 'Herencia y testamento',
    timeframeHint: 'Planificación familiar',
    question: '¿Qué especialidades hay si existen hijos menores de edad?',
    shortAnswer:
      'Cuando hay menores herederos, la ley protege sus intereses: en ciertos repartos o si hubiera conflicto de intereses con el progenitor sobreviviente, puede hacer falta autorización judicial o un defensor judicial.',
    steps: [
      'Consultad en la notaría antes de firmar cualquier reparto para confirmar si interviene el Ministerio Fiscal o hace falta nombrar defensor judicial.',
      'Recordad también revisar si corresponde pensión de orfandad en la Seguridad Social.',
    ],
    relatedProcedureId: 'tutela-menores-comunicacion-escolar',
    getContextMatch: (c) =>
      c.answers.hasMinorChildren === 'si'
        ? { matches: true, reason: 'Hay hijos menores en este caso' }
        : null,
  },
  {
    id: 'faq-impuesto-sucesiones-plazo',
    category: 'impuestos',
    categoryLabel: 'Impuestos y plazos',
    timeframeHint: 'Plazo legal: 6 meses',
    question: '¿Cuál es el plazo del Impuesto de Sucesiones y cómo se pide prórroga?',
    shortAnswer:
      'El plazo general es de 6 meses naturales desde la fecha del fallecimiento. Si veis que no vais a llegar a tiempo con los papeles o la notaría, podéis solicitar una prórroga de otros 6 meses antes de que se cumpla el quinto mes.',
    steps: [
      'La prórroga debe pedirse obligatoriamente dentro de los primeros 5 meses desde el fallecimiento ante la hacienda autonómica.',
      'Presentar el impuesto es obligatorio aunque en vuestra comunidad autónoma la cuota a pagar sea cero o muy baja por las bonificaciones.',
    ],
    importantNote:
      'Si se solicita prórroga, la administración suele aplicar intereses de demora por los meses adicionales, aunque evita sanciones por presentación fuera de plazo.',
    relatedProcedureId: 'impuesto-sucesiones',
    getContextMatch: (c) =>
      !c.taskStates['impuesto-sucesiones']?.done
        ? { matches: true, reason: `Plazo fiscal clave en ${c.ccaa}` }
        : null,
  },
  {
    id: 'faq-ccaa-impuesto',
    category: 'impuestos',
    categoryLabel: 'Impuestos y plazos',
    timeframeHint: 'Normativa autonómica',
    question: '¿En qué Comunidad Autónoma se paga el Impuesto de Sucesiones?',
    shortAnswer:
      'No depende de dónde haya fallecido ni de dónde estén los bienes, sino de la Comunidad Autónoma donde la persona fallecida tuvo su residencia habitual durante el mayor número de días en los últimos 5 años.',
    steps: [
      'Cada comunidad aplica sus propias reducciones y bonificaciones por parentesco (especialmente entre cónyuges, hijos y padres).',
      'Si vivía en el extranjero o los herederos residen fuera de España, puede gestionarse ante la Agencia Tributaria estatal aplicando la normativa autonómica correspondiente.',
    ],
    relatedProcedureId: 'impuesto-sucesiones',
    getContextMatch: (c) => ({
      matches: true,
      reason: `Aplicable según residencia en ${c.ccaa}`,
    }),
  },
  {
    id: 'faq-plusvalia',
    category: 'impuestos',
    categoryLabel: 'Impuestos y plazos',
    timeframeHint: 'Plazo legal: 6 meses',
    question: '¿Qué es la plusvalía municipal y cuándo hay que presentarla?',
    shortAnswer:
      'Es un impuesto del Ayuntamiento que solo se aplica si se heredan pisos, casas, locales o terrenos urbanos. El plazo también es de 6 meses desde el fallecimiento (prorrogable otros 6 meses si se solicita dentro de ese plazo).',
    steps: [
      'Se tramita en el Ayuntamiento donde está situado cada inmueble heredado.',
      'Si el valor del inmueble no ha aumentado desde que lo adquirió la persona fallecida, podéis aportar las escrituras para acreditar que no existe incremento sujeto a tributación.',
    ],
    relatedProcedureId: 'plusvalia-municipal',
    getContextMatch: (c) =>
      c.answers.hasProperty === 'si'
        ? { matches: true, reason: 'Aplica al existir vivienda en propiedad' }
        : null,
  },
  {
    id: 'faq-irpf-fallecido',
    category: 'impuestos',
    categoryLabel: 'Impuestos y plazos',
    timeframeHint: 'Campaña de la Renta siguiente',
    question: '¿Hay que hacer la declaración de la Renta (IRPF) de la persona fallecida?',
    shortAnswer:
      'Sí, si durante el año del fallecimiento obtuvo ingresos por encima de los límites obligatorios (o si sale a devolver y queréis solicitarlo). Se presenta en la campaña de la Renta del año siguiente, abarcando desde el 1 de enero hasta el día del fallecimiento.',
    steps: [
      'Si el resultado es a devolver, los herederos pueden solicitar la devolución adjuntando el modelo H-100 junto con el testamento o declaración de herederos.',
    ],
    relatedProcedureId: 'declaracion-renta-fallecido',
  },
  {
    id: 'faq-bancos-bloqueo',
    category: 'bancos_pensiones',
    categoryLabel: 'Bancos y pensiones',
    timeframeHint: 'Primeras semanas',
    question: '¿Qué ocurre con las cuentas bancarias y recibos al avisar al banco?',
    shortAnswer:
      'Al comunicar el fallecimiento, el banco bloquea la parte de saldo que pertenecía al fallecido hasta que se acredite quiénes son los herederos y se liquide el Impuesto de Sucesiones. Los recibos básicos de suministros y los gastos de entierro debidamente facturados suelen poder cargarse con autorización.',
    steps: [
      'Si había otro cotitular, esa persona normalmente puede seguir disponiendo de su mitad del saldo, no de la totalidad.',
      'Pedid al banco el «certificado de posiciones y saldos a fecha de fallecimiento», porque lo necesitaréis para la notaría y el impuesto.',
      'Las personas autorizadas (que no son titulares) pierden la facultad de operar en cuanto fallece el titular.',
    ],
    relatedProcedureId: 'bloqueo-saldos-bancarios',
    getContextMatch: (c) =>
      c.answers.hasBankAccounts === 'si'
        ? { matches: true, reason: 'Hay cuentas bancarias en este caso' }
        : null,
  },
  {
    id: 'faq-pensiones-viudedad',
    category: 'bancos_pensiones',
    categoryLabel: 'Bancos y pensiones',
    timeframeHint: 'Recomendado en 3 meses',
    question: '¿Cómo se solicitan la pensión de viudedad, orfandad o el auxilio por defunción?',
    shortAnswer:
      'Se solicitan ante el Instituto Nacional de la Seguridad Social (INSS) o en las Clases Pasivas si era funcionario. Conviene presentarlo antes de que pasen 3 meses desde el fallecimiento para cobrar con efecto retroactivo desde el día siguiente al fallecimiento.',
    steps: [
      'La pensión del último mes suele pagarse íntegra por el mes completo en que ocurrió el fallecimiento, aunque conviene comunicar la baja cuanto antes para evitar cobros indebidos posteriores.',
      'Podéis presentar la solicitud por sede electrónica de la Seguridad Social o pidiendo cita presencial en un CAISS.',
    ],
    relatedProcedureId: 'pension-viudedad-orfandad-auxilio',
    getContextMatch: (c) =>
      c.answers.receivedPension === 'si' ||
      c.answers.wasEmployed === 'si' ||
      c.answers.maritalStatus === 'casado_a' ||
      c.answers.maritalStatus === 'pareja_hecho' ||
      c.answers.hasMinorChildren === 'si'
        ? { matches: true, reason: 'Posible pensión o prestación aplicable' }
        : null,
  },
  {
    id: 'faq-deudas-beneficio',
    category: 'vivienda_deudas',
    categoryLabel: 'Vivienda y deudas',
    timeframeHint: 'Antes de aceptar la herencia',
    question: '¿Se heredan las deudas? ¿Qué significa aceptar a beneficio de inventario?',
    shortAnswer:
      'Si aceptas una herencia de forma normal (pura y simple), respondes de las deudas del fallecido incluso con tu propio patrimonio. Para protegerte si hay dudas sobre préstamos, avales o deudas, puedes aceptar «a beneficio de inventario» o incluso renunciar ante notario.',
    steps: [
      'Con el beneficio de inventario, las deudas se pagan únicamente hasta donde alcancen los bienes heredados, sin tocar tu patrimonio personal.',
      'Es muy importante no disponer de bienes ni aceptar tácitamente la herencia antes de comprobar todas las deudas o consultar en notaría.',
    ],
    importantNote:
      'El plazo general para solicitar la formación de inventario ante notario puede ser breve (30 días desde que se tiene conocimiento o desde el requerimiento).',
    relatedProcedureId: 'revision-deudas-beneficio-inventario',
    getContextMatch: (c) =>
      c.answers.hasDebts === 'si' || c.answers.hasDebts === 'no_se'
        ? { matches: true, reason: 'Existen posibles deudas o están por confirmar' }
        : null,
  },
  {
    id: 'faq-alquiler',
    category: 'vivienda_deudas',
    categoryLabel: 'Vivienda y deudas',
    timeframeHint: 'Plazo legal: 3 meses',
    question: '¿Qué pasa si vivía en una vivienda de alquiler?',
    shortAnswer:
      'Los familiares cercanos que convivieran con la persona fallecida (cónyuge, pareja, hijos o padres según los requisitos legales) tienen derecho a subrogarse en el contrato de alquiler, pero deben comunicarlo por escrito al propietario dentro de los 3 meses siguientes al fallecimiento.',
    steps: [
      'Si nadie va a continuar en la vivienda, enviad comunicación fehaciente (burofax o acuerdo firmado) con el certificado de defunción para extinguir el contrato y recuperar la fianza.',
    ],
    relatedProcedureId: 'subrogacion-cancelacion-alquiler',
    getContextMatch: (c) =>
      c.answers.hasRentedHome === 'si'
        ? { matches: true, reason: 'Vivienda habitual en alquiler' }
        : null,
  },
  {
    id: 'faq-vehiculo-dgt',
    category: 'vivienda_deudas',
    categoryLabel: 'Vivienda y deudas',
    timeframeHint: 'Plazo: 90 días',
    question: '¿Se puede usar el coche del fallecido y qué trámite hay que hacer en la DGT?',
    shortAnswer:
      'Quien tenga la custodia o uso provisional del vehículo debe comunicarlo a la Dirección General de Tráfico (DGT) en el plazo de 90 días desde el fallecimiento, y posteriormente hacer la transferencia definitiva cuando se adjudique la herencia.',
    steps: [
      'Revisad que el seguro del coche sigue vigente e informad a la aseguradora del fallecimiento para actualizar el tomador o darlo de baja si no se va a usar.',
    ],
    relatedProcedureId: 'cambio-titularidad-vehiculo-dgt',
    getContextMatch: (c) =>
      c.answers.hasVehicle === 'si'
        ? { matches: true, reason: 'Hay vehículo registrado en este caso' }
        : null,
  },
];

export function resolveFaqContext(
  item: ContextualFaqItem,
  bereavementCase: BereavementCase | null
): { matches: boolean; reason: string } | null {
  if (!bereavementCase || !item.getContextMatch) return null;
  const days = daysSinceDate(bereavementCase.deathDate);
  return item.getContextMatch(bereavementCase, days);
}
