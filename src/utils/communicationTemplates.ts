import type { BereavementCase } from '../types/domain';
import { formatDateES } from './caseEngine';

export interface CommunicationTemplate {
  id: string;
  title: string;
  recipientHint: string;
  subject: string;
  body: string;
}

export function buildCommunicationTemplates(
  bereavementCase: BereavementCase,
  senderName: string
): CommunicationTemplate[] {
  const deceased = bereavementCase.deceasedName || '[Nombre completo de la persona fallecida]';
  const deathDate = formatDateES(bereavementCase.deathDate);
  const ccaa = bereavementCase.ccaa || '[Comunidad Autónoma]';
  const sender = senderName || bereavementCase.ownerName || '[Tu nombre y apellidos]';

  return [
    {
      id: 'banco-saldos',
      title: 'Solicitud al banco de bloqueo y certificado de saldos',
      recipientHint: 'Entidad bancaria (Departamento de Testamentarías)',
      subject: `Comunicación de fallecimiento y solicitud de certificado de saldos — ${deceased}`,
      body: `Estimados señores:\n\nPor medio de la presente les comunico el fallecimiento de D./D.ª ${deceased}, ocurrido el día ${deathDate} en ${bereavementCase.deathPlace || ccaa}, titular de cuentas y/o productos en su entidad.\n\nLes solicito que procedan al bloqueo preventivo correspondiente y nos emitan el certificado oficial de saldos, depósitos y posiciones bancarias a fecha de fallecimiento (${deathDate}), necesario para la liquidación del Impuesto de Sucesiones en ${ccaa}.\n\nAdjunto copia del Certificado Literal de Defunción y de mi documento de identidad.\n\nAtentamente,\n${sender}\nDNI/NIE: [Indicar tu DNI]\nTeléfono de contacto: [Indicar tu teléfono]`,
    },
    {
      id: 'seguro-vida-decesos',
      title: 'Comunicación de fallecimiento a compañía aseguradora',
      recipientHint: 'Compañía de seguros (Siniestros / Vida / Decesos)',
      subject: `Comunicación de siniestro por fallecimiento — Póliza de ${deceased}`,
      body: `A la atención del Departamento de Siniestros:\n\nLes comunico el fallecimiento de su asegurado/a D./D.ª ${deceased}, acaecido el ${deathDate}, a los efectos legales y contractuales oportunos (artículo 16 de la Ley de Contrato de Seguro).\n\nLes ruego nos indiquen la documentación necesaria para tramitar la prestación o cobertura asociada a la póliza número [Indicar número de póliza, si se conoce].\n\nAdjunto el Certificado Literal de Defunción.\n\nQuedo a su disposición para ampliar cualquier dato.\n\nAtentamente,\n${sender}\nTeléfono: [Indicar tu teléfono]`,
    },
    {
      id: 'prorroga-sucesiones',
      title: 'Solicitud de prórroga del Impuesto de Sucesiones (6 meses extra)',
      recipientHint: `Agencia Tributaria / Hacienda de ${ccaa} (presentar antes del 5.º mes)`,
      subject: `Solicitud de prórroga de plazo del Impuesto sobre Sucesiones — Causante: ${deceased}`,
      body: `A la atención de la Oficina Liquidadora / Agencia Tributaria de ${ccaa}:\n\nD./D.ª ${sender}, con DNI/NIE [Indicar tu DNI], en calidad de familiar/heredero de D./D.ª ${deceased}, fallecido/a el día ${deathDate} con último domicilio habitual en ${ccaa},\n\nEXPONE:\nQue hallándose dentro de los cinco primeros meses desde la fecha del fallecimiento, y necesitando tiempo adicional para reunir los certificados bancarios y formalizar la documentación hereditaria ante notaría,\n\nSOLICITA:\nQue se conceda la prórroga reglamentaria de seis meses adicionales para la presentación y autoliquidación del Impuesto sobre Sucesiones y Donaciones correspondiente al causante.\n\nAdjunto copia del Certificado Literal de Defunción.\n\nEn ${bereavementCase.deathPlace || ccaa}, a ${new Date().toLocaleDateString('es-ES')}.\n\nFirmado: ${sender}`,
    },
    {
      id: 'empresa-finiquito',
      title: 'Comunicación a la empresa y solicitud de liquidación',
      recipientHint: 'Departamento de Recursos Humanos de la empresa empleadora',
      subject: `Comunicación de fallecimiento y solicitud de liquidación — ${deceased}`,
      body: `Estimado equipo de Recursos Humanos:\n\nLamento comunicarles el fallecimiento de D./D.ª ${deceased}, trabajador/a de su empresa, ocurrido el día ${deathDate}.\n\nLes adjunto el Certificado Literal de Defunción para que puedan tramitar la baja correspondiente y les agradecería que nos informaran sobre la liquidación de haberes pendientes (días trabajados, pagas extras proporcionales, vacaciones no disfrutadas) y la posible existencia de un seguro colectivo vinculado a la empresa.\n\nGracias de antemano por su comprensión y ayuda.\n\nUn cordial saludo,\n${sender}\nTeléfono: [Indicar tu teléfono]`,
    },
    {
      id: 'alquiler-arrendador',
      title: 'Comunicación al propietario de vivienda en alquiler',
      recipientHint: 'Arrendador o agencia inmobiliaria (plazo legal 3 meses para subrogación)',
      subject: `Notificación de fallecimiento del arrendatario — Vivienda de ${deceased}`,
      body: `Estimado/a propietario/a o administrador/a:\n\nLe comunico formalmente el fallecimiento de D./D.ª ${deceased}, ocurrido el ${deathDate}, arrendatario/a de la vivienda situada en [Indicar dirección completa del piso].\n\n[OPCIÓN A — Si un familiar desea continuar en el piso]: De acuerdo con el artículo 16 de la Ley de Arrendamientos Urbanos, le notifico dentro del plazo legal de tres meses la voluntad de subrogarme en el contrato de arrendamiento en calidad de [cónyuge / pareja / hijo/a conviviente].\n\n[OPCIÓN B — Si se entrega la vivienda]: Les ruego acordemos fecha y hora para la entrega de llaves, firma del documento de resolución y devolución de la fianza depositada.\n\nAdjunto copia del Certificado de Defunción.\n\nAtentamente,\n${sender}\nTeléfono: [Indicar tu teléfono]`,
    },
    {
      id: 'baja-suministros',
      title: 'Baja o cambio de titularidad de suministros y telefonía',
      recipientHint: 'Compañía de luz, agua, gas, internet o telefonía',
      subject: `Solicitud de cambio de titularidad / baja por fallecimiento — Titular: ${deceased}`,
      body: `Estimados señores:\n\nPor la presente comunico el fallecimiento de D./D.ª ${deceased} (DNI [Indicar DNI si se conoce]), ocurrido el ${deathDate}, titular del contrato / línea número [Indicar número de contrato o teléfono].\n\nSolicito tramitar [el cambio de titularidad a mi nombre / la baja definitiva del servicio sin penalización por fallecimiento del titular], actualizando en su caso la domiciliación bancaria al IBAN [Indicar nuevo IBAN].\n\nAdjunto copia del Certificado de Defunción y de mi DNI.\n\nAtentamente,\n${sender}\nDNI/NIE: [Indicar tu DNI]\nTeléfono: [Indicar tu teléfono]`,
    },
  ];
}
