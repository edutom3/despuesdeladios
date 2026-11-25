import { jsPDF } from 'jspdf';
import type {
  BereavementCase,
  CaseDocument,
  PersonalizedProcedure,
} from '../types/domain';
import {
  aggregateRequiredDocuments,
  daysSinceDate,
  formatDateES,
  summarizeAnswersES,
} from './caseEngine';

export function downloadCaseSummaryPDF(
  bereavementCase: BereavementCase,
  procedures: PersonalizedProcedure[],
  uploadedDocs: CaseDocument[]
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const maxWidth = pageWidth - margin * 2;
  let y = 18;

  const ensureSpace = (neededMm: number) => {
    if (y + neededMm > pageHeight - 18) {
      doc.addPage();
      y = 18;
    }
  };

  const addWrapped = (text: string, fontSize: number, bold = false, color: [number, number, number] = [30, 32, 36]) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(fontSize);
    doc.setTextColor(color[0], color[1], color[2]);
    const lines = doc.splitTextToSize(text, maxWidth) as string[];
    const lineHeight = fontSize * 0.45;
    ensureSpace(lines.length * lineHeight + 2);
    doc.text(lines, margin, y);
    y += lines.length * lineHeight + 2;
  };

  // Header
  addWrapped('Después del adiós — Resumen organizado del caso', 17, true, [20, 21, 24]);
  addWrapped(
    `Persona fallecida: ${bereavementCase.deceasedName} · Fallecimiento: ${formatDateES(bereavementCase.deathDate)} (${daysSinceDate(bereavementCase.deathDate)} días transcurridos)`,
    10.5,
    false,
    [75, 80, 88]
  );
  addWrapped(
    `Comunidad Autónoma: ${bereavementCase.ccaa} · Lugar: ${bereavementCase.deathPlace || 'No indicado'}`,
    10,
    false,
    [75, 80, 88]
  );
  addWrapped(`Situación marcada: ${summarizeAnswersES(bereavementCase.answers)}`, 9, false, [100, 104, 112]);

  y += 2;
  doc.setDrawColor(214, 195, 165);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  // Procedures grouped by bucket
  const buckets: Array<{ key: PersonalizedProcedure['priorityBucket']; title: string }> = [
    { key: 'first', title: '1. Haz esto primero' },
    { key: 'months', title: '2. En los próximos meses' },
    { key: 'later', title: '3. Más adelante' },
  ];

  for (const bucket of buckets) {
    const items = procedures.filter((p) => p.priorityBucket === bucket.key);
    if (items.length === 0) continue;

    ensureSpace(14);
    addWrapped(bucket.title, 13, true, [115, 92, 54]);

    for (const proc of items) {
      const state = bereavementCase.taskStates[proc.id];
      const statusText = state?.done ? '[HECHO]' : '[PENDIENTE]';
      const assigneeText = state?.assigneeName ? ` · Responsable: ${state.assigneeName}` : '';
      const deadlineLabel = proc.effectiveDeadlineDate
        ? `${formatDateES(proc.effectiveDeadlineDate)} (${proc.deadlineKind === 'legal' ? 'Plazo legal' : 'Fecha orientativa'})`
        : 'Sin fecha fija';

      const lockNote = proc.isLockedByPlan ? ' (Pendiente de activación)' : '';
      addWrapped(`${statusText} ${proc.title}${lockNote}`, 10.5, true, [28, 30, 34]);
      addWrapped(`Plazo: ${deadlineLabel}${assigneeText}`, 9.2, false, [88, 92, 100]);
      if (!proc.isLockedByPlan) {
        addWrapped(`Dónde: ${proc.effectiveWhereToDoIt}`, 9, false, [95, 98, 105]);
      }
      y += 1.5;
    }
    y += 3;
  }

  // Document checklist
  const requiredDocs = aggregateRequiredDocuments(procedures);
  ensureSpace(16);
  doc.setDrawColor(214, 195, 165);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;
  addWrapped('4. Lista de documentos necesarios', 13, true, [115, 92, 54]);

  for (const reqDoc of requiredDocs) {
    const gathered = Boolean(bereavementCase.docStates[reqDoc.docKey]?.gathered);
    const copies = uploadedDocs.filter((d) => d.docTypeKey === reqDoc.docKey);
    const copiesText = copies.length > 0 ? ` (${copies.length} copia/s guardada/s)` : '';
    addWrapped(
      `${gathered ? '[REUNIDO]' : '[PENDIENTE]'} ${reqDoc.label}${copiesText}`,
      9.5,
      false,
      gathered ? [36, 98, 66] : [55, 58, 64]
    );
  }

  const extraDocs = uploadedDocs.filter((d) => d.docTypeKey === 'otros');
  if (extraDocs.length > 0) {
    y += 3;
    addWrapped('Otros documentos guardados por la familia:', 10.5, true, [28, 30, 34]);
    for (const d of extraDocs) {
      const meta = [d.extractedDate, d.extractedNumber, d.extractedIssuer].filter(Boolean).join(' · ');
      addWrapped(`• ${d.title}${meta ? ` (${meta})` : ''}`, 9.2, false, [75, 80, 88]);
    }
  }

  // Footer disclaimer on final page
  ensureSpace(18);
  y += 5;
  doc.setDrawColor(225, 220, 210);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;
  addWrapped(
    'Aviso importante: «Después del adiós» es una herramienta de organización e información práctica. No ofrece ni sustituye el asesoramiento jurídico, fiscal o notarial profesional.',
    8.5,
    false,
    [110, 114, 120]
  );

  const safeSlug = bereavementCase.deceasedName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  doc.save(`resumen-${safeSlug || 'caso'}-despues-del-adios.pdf`);
}
