import React, { useState } from 'react';
import {
  Camera,
  Check,
  Download,
  Edit3,
  Eye,
  FileText,
  Lock,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { auth } from '../firebase';
import {
  deleteCaseDocument,
  fetchCaseDocumentFileUrl,
  toggleCaseDocumentGathered,
  updateCaseDocumentMeta,
  uploadCaseDocument,
} from '../services/firestoreService';
import type {
  BereavementCase,
  CaseDocument,
  PersonalizedProcedure,
} from '../types/domain';
import { aggregateRequiredDocuments } from '../utils/caseEngine';
import { downloadCaseSummaryPDF } from '../utils/pdfExport';
import { DocumentScannerModal } from './DocumentScannerModal';

interface CaseDocumentsTabProps {
  bereavementCase: BereavementCase;
  procedures: PersonalizedProcedure[];
  uploadedDocs: CaseDocument[];
  user: User;
  canCollaborate: boolean;
  onOpenUnlock: () => void;
}

async function compressFileToDataUrl(file: File): Promise<{ dataUrl: string; mimeType: string }> {
  if (file.type === 'application/pdf') {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('No se pudo leer el archivo PDF.'));
      reader.readAsDataURL(file);
    });
    if (dataUrl.length > 880000) {
      throw new Error('El PDF supera los 650 KB permitidos para subida privada.');
    }
    return { dataUrl, mimeType: 'application/pdf' };
  }

  // Compress images neatly in browser so they stay crisp and compact (<450 KB)
  const rawUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.readAsDataURL(file);
  });

  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 1280;
      const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * ratio);
      const canvasHeight = Math.round(img.height * ratio);
      canvas.height = canvasHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('No se pudo procesar la imagen.'));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve({
        dataUrl: canvas.toDataURL('image/jpeg', 0.78),
        mimeType: 'image/jpeg',
      });
    };
    img.onerror = () => reject(new Error('Formato de imagen no compatible.'));
    img.src = rawUrl;
  });
}

export const CaseDocumentsTab: React.FC<CaseDocumentsTabProps> = ({
  bereavementCase,
  procedures,
  uploadedDocs,
  user,
  canCollaborate,
  onOpenUnlock,
}) => {
  const requiredDocs = aggregateRequiredDocuments(procedures);
  const gatheredCount = requiredDocs.filter(
    (d) => bereavementCase.docStates[d.docKey]?.gathered
  ).length;

  const [scannerTarget, setScannerTarget] = useState<{
    docTypeKey: string;
    defaultTitle: string;
  } | null>(null);
  const [otherTitle, setOtherTitle] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Preview & Edit modal
  const [previewDoc, setPreviewDoc] = useState<{ meta: CaseDocument; dataUrl: string } | null>(
    null
  );
  const [editingDoc, setEditingDoc] = useState<CaseDocument | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editNumber, setEditNumber] = useState('');
  const [editIssuer, setEditIssuer] = useState('');

  const userName = user.displayName || user.email?.split('@')[0] || 'Familiar';

  const handleToggleGathered = async (docKey: string, current: boolean) => {
    if (!canCollaborate) return;
    setErrorMsg(null);
    try {
      await toggleCaseDocumentGathered(
        bereavementCase.id,
        bereavementCase.docStates,
        docKey,
        !current,
        userName
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo actualizar el documento.');
    }
  };

  const handleUploadFile = async (
    file: File,
    docTypeKey: string,
    defaultTitle: string
  ) => {
    if (!bereavementCase.unlocked) {
      onOpenUnlock();
      return;
    }
    setErrorMsg(null);
    setBusyKey(docTypeKey);
    try {
      const { dataUrl, mimeType } = await compressFileToDataUrl(file);
      let extracted: {
        suggestedTitle?: string;
        extractedDate?: string;
        extractedNumber?: string;
        extractedIssuer?: string;
        extractedSubject?: string;
      } = {};

      try {
        const token = await auth.currentUser?.getIdToken();
        const resp = await fetch('/api/documents/extract', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token || ''}`,
          },
          body: JSON.stringify({ dataUrl, mimeType, docHint: defaultTitle }),
        });
        if (resp.ok) {
          extracted = (await resp.json()) as typeof extracted;
        }
      } catch {
        // Store file even if OCR fails
      }

      await uploadCaseDocument(bereavementCase.id, user, {
        docTypeKey,
        title: defaultTitle || extracted.suggestedTitle || file.name,
        mimeType,
        fileSize: file.size,
        dataUrl,
        extractedDate: extracted.extractedDate,
        extractedNumber: extracted.extractedNumber,
        extractedIssuer: extracted.extractedIssuer,
        extractedSubject: extracted.extractedSubject,
      });

      if (docTypeKey !== 'otros' && !bereavementCase.docStates[docTypeKey]?.gathered) {
        await toggleCaseDocumentGathered(
          bereavementCase.id,
          bereavementCase.docStates,
          docTypeKey,
          true,
          userName
        );
      }
      if (docTypeKey === 'otros') setOtherTitle('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo subir la copia.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleOpenFile = async (docMeta: CaseDocument) => {
    setErrorMsg(null);
    setBusyKey(docMeta.id);
    try {
      const dataUrl = await fetchCaseDocumentFileUrl(bereavementCase.id, docMeta.id);
      if (!dataUrl) {
        setErrorMsg('No se encontró el archivo adjunto.');
        return;
      }
      setPreviewDoc({ meta: docMeta, dataUrl });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo abrir el archivo.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleSaveScan = async (payload: {
    docTypeKey: string;
    title: string;
    mimeType: string;
    fileSize: number;
    dataUrl: string;
    extractedDate?: string;
    extractedNumber?: string;
    extractedIssuer?: string;
    extractedSubject?: string;
  }) => {
    await uploadCaseDocument(bereavementCase.id, user, payload);
    if (
      payload.docTypeKey !== 'otros' &&
      !bereavementCase.docStates[payload.docTypeKey]?.gathered
    ) {
      await toggleCaseDocumentGathered(
        bereavementCase.id,
        bereavementCase.docStates,
        payload.docTypeKey,
        true,
        userName
      );
    }
  };

  const renderUploadedCard = (d: CaseDocument) => (
    <div
      key={d.id}
      className="mt-3 rounded-xl border border-[#E7E2D8] bg-[#FAF8F5] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-[#141518] truncate">{d.title}</p>
        <p className="text-xs text-[#666A73] mt-0.5">
          Subido por {d.uploadedByName} · {new Date(d.createdAt).toLocaleDateString('es-ES')}
        </p>
        {(d.extractedDate || d.extractedNumber || d.extractedIssuer) && (
          <p className="text-xs text-[#7D633A] mt-1 font-mono-num">
            {[
              d.extractedDate ? `Fecha: ${d.extractedDate}` : '',
              d.extractedNumber ? `N.º: ${d.extractedNumber}` : '',
              d.extractedIssuer ? `Emisor: ${d.extractedIssuer}` : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => void handleOpenFile(d)}
          disabled={busyKey === d.id}
          className="min-h-[40px] px-3 rounded-lg border border-[#D8D0C2] bg-white text-xs font-medium text-[#1C1E22] hover:bg-[#F1ECE2] inline-flex items-center gap-1.5"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Abrir</span>
        </button>
        {canCollaborate && (
          <>
            <button
              type="button"
              onClick={() => {
                setEditingDoc(d);
                setEditTitle(d.title);
                setEditDate(d.extractedDate || '');
                setEditNumber(d.extractedNumber || '');
                setEditIssuer(d.extractedIssuer || '');
              }}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-[#D8D0C2] bg-white text-[#45484F] hover:bg-[#F1ECE2]"
              aria-label="Editar datos del documento"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void deleteCaseDocument(bereavementCase.id, d.id)}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-[#D8D0C2] bg-white text-[#7A7D85] hover:text-red-700 hover:bg-red-50"
              aria-label="Borrar copia"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );

  const otherDocs = uploadedDocs.filter((d) => d.docTypeKey === 'otros');

  return (
    <div className="space-y-6">
      {/* Header & Summary Actions */}
      <div className="rounded-2xl bg-white border border-[#E7E2D8] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#141518]">
            Carpeta de documentos
          </h2>
          <p className="mt-1 text-sm text-[#5B5E65] font-mono-num">
            {gatheredCount} de {requiredDocs.length} documentos reunidos · {uploadedDocs.length}{' '}
            copias guardadas
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          {canCollaborate && (
            <button
              type="button"
              onClick={() => {
                if (!bereavementCase.unlocked) {
                  onOpenUnlock();
                  return;
                }
                setScannerTarget({ docTypeKey: 'otros', defaultTitle: 'Documento escaneado' });
              }}
              className="min-h-[44px] px-4 rounded-xl bg-[#141518] text-[#F6F4EF] text-sm font-medium hover:bg-[#25272D] inline-flex items-center gap-2"
            >
              <Camera className="w-4 h-4 text-[#D6C3A5]" />
              <span>Escanear con cámara</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => downloadCaseSummaryPDF(bereavementCase, procedures, uploadedDocs)}
            className="min-h-[44px] px-4 rounded-xl border border-[#8F754B] bg-[#FAF8F5] text-[#7D633A] text-sm font-medium hover:bg-[#F1ECE2] inline-flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            <span>Descargar resumen en PDF</span>
          </button>
        </div>
      </div>

      {!bereavementCase.unlocked && (
        <div className="rounded-2xl border border-[#D6C3A5] bg-[#F7F2E8] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-sm text-[#4F3D22]">
            Puedes marcar qué documentos ya tienes. Para subir copias privadas o escanear con la
            cámara del móvil, desbloquea el caso completo.
          </p>
          <button
            type="button"
            onClick={onOpenUnlock}
            className="min-h-[40px] px-4 rounded-xl bg-[#141518] text-[#F6F4EF] text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
          >
            <Lock className="w-3.5 h-3.5 text-[#D6C3A5]" />
            <span>Desbloquear caso</span>
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMsg}
        </div>
      )}

      {/* Required Documents Checklist */}
      <div className="space-y-3">
        {requiredDocs.map((reqDoc) => {
          const isGathered = Boolean(bereavementCase.docStates[reqDoc.docKey]?.gathered);
          const copies = uploadedDocs.filter((d) => d.docTypeKey === reqDoc.docKey);
          const isBusy = busyKey === reqDoc.docKey;

          return (
            <div
              key={reqDoc.docKey}
              className="rounded-2xl bg-white border border-[#E7E2D8] p-4 sm:p-5"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => void handleToggleGathered(reqDoc.docKey, isGathered)}
                  disabled={!canCollaborate}
                  className="flex items-start gap-3 text-left flex-1 min-h-[44px]"
                >
                  <span
                    className={`mt-0.5 w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                      isGathered
                        ? 'bg-[#2C6B4B] border-[#2C6B4B] text-white'
                        : 'bg-[#FAF8F5] border-[#C9C0B1] text-transparent'
                    }`}
                  >
                    <Check className="w-4 h-4" />
                  </span>
                  <div>
                    <p
                      className={`text-sm sm:text-base font-medium ${
                        isGathered ? 'text-[#2C6B4B]' : 'text-[#141518]'
                      }`}
                    >
                      {reqDoc.label}
                    </p>
                    <p className="text-xs text-[#666A73] mt-1">
                      {isGathered ? 'Ya lo tenemos · ' : 'Pendiente · '}
                      Lo piden: {reqDoc.procedureTitles.slice(0, 3).join(', ')}
                      {reqDoc.procedureTitles.length > 3
                        ? ` y ${reqDoc.procedureTitles.length - 3} más`
                        : ''}
                    </p>
                  </div>
                </button>

                {canCollaborate && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        if (!bereavementCase.unlocked) {
                          onOpenUnlock();
                          return;
                        }
                        setScannerTarget({
                          docTypeKey: reqDoc.docKey,
                          defaultTitle: reqDoc.label,
                        });
                      }}
                      className="min-h-[40px] px-3 rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] text-xs font-medium text-[#1C1E22] hover:bg-[#EFECE5] inline-flex items-center gap-1.5"
                    >
                      <Camera className="w-3.5 h-3.5 text-[#8F754B]" />
                      <span>Escanear</span>
                    </button>

                    <label className="min-h-[40px] px-3 rounded-xl border border-[#D8D0C2] bg-white text-xs font-medium text-[#1C1E22] hover:bg-[#F5F1EA] inline-flex items-center gap-1.5 cursor-pointer">
                      <Upload className="w-3.5 h-3.5 text-[#8F754B]" />
                      <span>{isBusy ? 'Subiendo...' : 'Subir'}</span>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        className="hidden"
                        disabled={isBusy}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handleUploadFile(f, reqDoc.docKey, reqDoc.label);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                )}
              </div>

              {copies.map(renderUploadedCard)}
            </div>
          );
        })}
      </div>

      {/* Other Documents */}
      <div className="rounded-2xl bg-white border border-[#E7E2D8] p-5 space-y-4">
        <div>
          <h3 className="font-display text-2xl font-semibold text-[#141518]">Otros documentos</h3>
          <p className="text-xs text-[#666A73] mt-0.5">
            Guarda aquí recibos, escrituras, pólizas o cualquier papel adicional que quiera tener
            a mano la familia.
          </p>
        </div>

        {canCollaborate && (
          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={otherTitle}
              onChange={(e) => setOtherTitle(e.target.value)}
              placeholder="Ej.: Recibo IBI vivienda, Póliza hogar..."
              className="flex-1 min-h-[44px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] px-3.5 text-sm"
            />
            <label className="min-h-[44px] px-4 rounded-xl bg-[#141518] text-[#F6F4EF] text-sm font-medium inline-flex items-center justify-center gap-2 cursor-pointer hover:bg-[#25272D] shrink-0">
              <FileText className="w-4 h-4 text-[#D6C3A5]" />
              <span>{busyKey === 'otros' ? 'Subiendo...' : 'Subir foto o PDF'}</span>
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                disabled={busyKey === 'otros'}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleUploadFile(f, 'otros', otherTitle.trim() || f.name);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        )}

        {otherDocs.length === 0 ? (
          <p className="text-xs text-[#7A7D85]">Todavía no hay archivos en «Otros documentos».</p>
        ) : (
          otherDocs.map(renderUploadedCard)
        )}
      </div>

      {/* Scanner Modal */}
      {scannerTarget && (
        <DocumentScannerModal
          docTypeKey={scannerTarget.docTypeKey}
          defaultTitle={scannerTarget.defaultTitle}
          onClose={() => setScannerTarget(null)}
          onSaveScanned={handleSaveScan}
        />
      )}

      {/* Preview File Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white border border-[#E7E2D8] overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-5 py-3.5 border-b border-[#E7E2D8] flex items-center justify-between gap-4">
              <h3 className="text-sm font-semibold text-[#141518] truncate">
                {previewDoc.meta.title}
              </h3>
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg hover:bg-[#F5F1EA]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-auto flex-1 bg-[#FAF8F5] flex items-center justify-center">
              {previewDoc.meta.mimeType === 'application/pdf' ? (
                <iframe
                  src={previewDoc.dataUrl}
                  title={previewDoc.meta.title}
                  className="w-full h-[65vh] rounded-lg border border-[#E7E2D8]"
                />
              ) : (
                <img
                  src={previewDoc.dataUrl}
                  alt={previewDoc.meta.title}
                  className="max-w-full max-h-[65vh] object-contain rounded-lg"
                />
              )}
            </div>
            <div className="px-5 py-3 border-t border-[#E7E2D8] flex justify-end">
              <a
                href={previewDoc.dataUrl}
                download={previewDoc.meta.title}
                className="min-h-[40px] px-4 rounded-xl bg-[#141518] text-[#F6F4EF] text-xs font-medium inline-flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Guardar en el dispositivo</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Edit Metadata Modal */}
      {editingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await updateCaseDocumentMeta(bereavementCase.id, editingDoc.id, {
                title: editTitle,
                extractedDate: editDate,
                extractedNumber: editNumber,
                extractedIssuer: editIssuer,
              });
              setEditingDoc(null);
            }}
            className="w-full max-w-md rounded-2xl bg-white p-6 space-y-4 border border-[#E7E2D8]"
          >
            <h3 className="font-display text-2xl font-semibold text-[#141518]">
              Corregir datos del documento
            </h3>
            <div>
              <label className="block text-xs font-medium text-[#45484F] mb-1">Nombre</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                required
                className="w-full min-h-[44px] rounded-xl border border-[#D8D0C2] px-3 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#45484F] mb-1">Fecha</label>
                <input
                  type="text"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  placeholder="DD/MM/AAAA"
                  className="w-full min-h-[44px] rounded-xl border border-[#D8D0C2] px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#45484F] mb-1">
                  Número / Expediente
                </label>
                <input
                  type="text"
                  value={editNumber}
                  onChange={(e) => setEditNumber(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-[#D8D0C2] px-3 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#45484F] mb-1">
                Organismo o entidad
              </label>
              <input
                type="text"
                value={editIssuer}
                onChange={(e) => setEditIssuer(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-[#D8D0C2] px-3 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingDoc(null)}
                className="min-h-[44px] px-4 rounded-xl border border-[#D8D0C2] text-sm font-medium"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="min-h-[44px] px-5 rounded-xl bg-[#141518] text-[#F6F4EF] text-sm font-semibold"
              >
                Guardar cambios
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
