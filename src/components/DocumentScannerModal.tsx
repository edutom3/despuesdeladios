import React, { useEffect, useRef, useState } from 'react';
import { Camera, Check, RotateCcw, Upload, X } from 'lucide-react';
import { auth } from '../firebase';

interface Point {
  x: number; // normalized 0..1
  y: number; // normalized 0..1
}

interface DocumentScannerModalProps {
  docTypeKey: string;
  defaultTitle: string;
  onClose: () => void;
  onSaveScanned: (payload: {
    docTypeKey: string;
    title: string;
    mimeType: string;
    fileSize: number;
    dataUrl: string;
    extractedDate?: string;
    extractedNumber?: string;
    extractedIssuer?: string;
    extractedSubject?: string;
  }) => Promise<void>;
}

const DEFAULT_CORNERS: [Point, Point, Point, Point] = [
  { x: 0.1, y: 0.1 },
  { x: 0.9, y: 0.1 },
  { x: 0.9, y: 0.9 },
  { x: 0.1, y: 0.9 },
];

export const DocumentScannerModal: React.FC<DocumentScannerModalProps> = ({
  docTypeKey,
  defaultTitle,
  onClose,
  onSaveScanned,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cropContainerRef = useRef<HTMLDivElement | null>(null);

  const [mode, setMode] = useState<'camera' | 'crop' | 'preview'>('camera');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [corners, setCorners] = useState<[Point, Point, Point, Point]>(DEFAULT_CORNERS);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [bwMode, setBwMode] = useState(true);
  const [processedDataUrl, setProcessedDataUrl] = useState<string | null>(null);
  const [docTitle, setDocTitle] = useState(defaultTitle);
  const [busy, setBusy] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== 'camera') return;
    let cancelled = false;
    async function startCamera() {
      setCameraError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1600 }, height: { ideal: 1200 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        setCameraError(
          'No se pudo abrir la cámara en este navegador. Puedes elegir una foto directamente desde tu dispositivo.'
        );
      }
    }
    void startCamera();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [mode]);

  const captureFromCamera = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    setRawImageSrc(canvas.toDataURL('image/jpeg', 0.9));
    setCorners(DEFAULT_CORNERS);
    setMode('crop');
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setRawImageSrc(reader.result);
        setCorners(DEFAULT_CORNERS);
        setMode('crop');
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingIdx === null || !cropContainerRef.current) return;
    const rect = cropContainerRef.current.getBoundingClientRect();
    const x = Math.min(0.98, Math.max(0.02, (e.clientX - rect.left) / rect.width));
    const y = Math.min(0.98, Math.max(0.02, (e.clientY - rect.top) / rect.height));
    setCorners((prev) => {
      const next = [...prev] as [Point, Point, Point, Point];
      next[draggingIdx] = { x, y };
      return next;
    });
  };

  // Bilinear perspective rectification + contrast enhancement
  const applyPerspectiveCrop = () => {
    if (!rawImageSrc) return;
    const img = new Image();
    img.onload = () => {
      const [tl, tr, br, bl] = corners;
      const srcPts = [
        { x: tl.x * img.width, y: tl.y * img.height },
        { x: tr.x * img.width, y: tr.y * img.height },
        { x: br.x * img.width, y: br.y * img.height },
        { x: bl.x * img.width, y: bl.y * img.height },
      ];

      const topW = Math.hypot(srcPts[1].x - srcPts[0].x, srcPts[1].y - srcPts[0].y);
      const botW = Math.hypot(srcPts[2].x - srcPts[3].x, srcPts[2].y - srcPts[3].y);
      const leftH = Math.hypot(srcPts[3].x - srcPts[0].x, srcPts[3].y - srcPts[0].y);
      const rightH = Math.hypot(srcPts[2].x - srcPts[1].x, srcPts[2].y - srcPts[1].y);

      const rawW = Math.max(topW, botW, 200);
      const rawH = Math.max(leftH, rightH, 200);
      const scale = Math.min(1, 1100 / Math.max(rawW, rawH));
      const outW = Math.round(rawW * scale);
      const outH = Math.round(rawH * scale);

      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = img.width;
      srcCanvas.height = img.height;
      const srcCtx = srcCanvas.getContext('2d');
      if (!srcCtx) return;
      srcCtx.drawImage(img, 0, 0);
      const srcData = srcCtx.getImageData(0, 0, img.width, img.height);

      const outCanvas = document.createElement('canvas');
      outCanvas.width = outW;
      outCanvas.height = outH;
      const outCtx = outCanvas.getContext('2d');
      if (!outCtx) return;
      const outImg = outCtx.createImageData(outW, outH);

      for (let dy = 0; dy < outH; dy++) {
        const v = dy / (outH - 1 || 1);
        for (let dx = 0; dx < outW; dx++) {
          const u = dx / (outW - 1 || 1);
          const sx =
            (1 - u) * (1 - v) * srcPts[0].x +
            u * (1 - v) * srcPts[1].x +
            u * v * srcPts[2].x +
            (1 - u) * v * srcPts[3].x;
          const sy =
            (1 - u) * (1 - v) * srcPts[0].y +
            u * (1 - v) * srcPts[1].y +
            u * v * srcPts[2].y +
            (1 - u) * v * srcPts[3].y;

          const ix = Math.min(img.width - 1, Math.max(0, Math.round(sx)));
          const iy = Math.min(img.height - 1, Math.max(0, Math.round(sy)));
          const sIdx = (iy * img.width + ix) * 4;
          const oIdx = (dy * outW + dx) * 4;

          let r = srcData.data[sIdx];
          let g = srcData.data[sIdx + 1];
          let b = srcData.data[sIdx + 2];

          if (bwMode) {
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            // Gentle contrast curve for crisp document legibility
            const enhanced = Math.min(255, Math.max(0, (lum - 128) * 1.45 + 142));
            r = g = b = enhanced;
          } else {
            r = Math.min(255, Math.max(0, (r - 128) * 1.15 + 132));
            g = Math.min(255, Math.max(0, (g - 128) * 1.15 + 132));
            b = Math.min(255, Math.max(0, (b - 128) * 1.15 + 132));
          }

          outImg.data[oIdx] = r;
          outImg.data[oIdx + 1] = g;
          outImg.data[oIdx + 2] = b;
          outImg.data[oIdx + 3] = 255;
        }
      }

      outCtx.putImageData(outImg, 0, 0);
      setProcessedDataUrl(outCanvas.toDataURL('image/jpeg', 0.82));
      setMode('preview');
    };
    img.src = rawImageSrc;
  };

  const handleSave = async () => {
    if (!processedDataUrl) return;
    setBusy(true);
    setStatusNote('Leyendo datos básicos del documento...');
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
        body: JSON.stringify({
          dataUrl: processedDataUrl,
          mimeType: 'image/jpeg',
          docHint: docTitle,
        }),
      });
      if (resp.ok) {
        extracted = (await resp.json()) as typeof extracted;
      }
    } catch {
      // Save cleanly even if OCR fails or user is offline
    }

    setStatusNote('Guardando copia privada...');
    try {
      const approxBytes = Math.round((processedDataUrl.length * 3) / 4);
      await onSaveScanned({
        docTypeKey,
        title: docTitle.trim() || extracted.suggestedTitle || 'Documento escaneado',
        mimeType: 'image/jpeg',
        fileSize: approxBytes,
        dataUrl: processedDataUrl,
        extractedDate: extracted.extractedDate,
        extractedNumber: extracted.extractedNumber,
        extractedIssuer: extracted.extractedIssuer,
        extractedSubject: extracted.extractedSubject,
      });
      onClose();
    } catch (err) {
      setStatusNote(err instanceof Error ? err.message : 'No se pudo guardar el escaneo.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4">
      <div className="w-full max-w-xl rounded-2xl bg-[#141518] text-[#F6F4EF] border border-white/15 overflow-hidden flex flex-col max-h-[92vh]">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-semibold">Escanear documento</h2>
            <p className="text-xs text-[#B8B2A6]">
              {mode === 'camera' && 'Enfoca el papel sobre una superficie oscura'}
              {mode === 'crop' && 'Arrastra las 4 esquinas para encuadrar el papel'}
              {mode === 'preview' && 'Revisa la nitidez antes de guardar'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[#CFC9BE] hover:bg-white/10"
            aria-label="Cerrar escáner"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {mode === 'camera' && (
            <div className="space-y-4">
              {cameraError ? (
                <div className="rounded-xl border border-amber-400/30 bg-amber-950/30 p-4 text-sm text-amber-100">
                  {cameraError}
                </div>
              ) : (
                <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3]">
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                {!cameraError && (
                  <button
                    type="button"
                    onClick={captureFromCamera}
                    className="flex-1 min-h-[48px] rounded-xl bg-[#D6C3A5] text-[#141518] text-sm font-semibold inline-flex items-center justify-center gap-2"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Hacer foto</span>
                  </button>
                )}
                <label className="flex-1 min-h-[48px] rounded-xl border border-white/20 bg-white/5 text-sm font-medium inline-flex items-center justify-center gap-2 cursor-pointer hover:bg-white/10">
                  <Upload className="w-4 h-4" />
                  <span>Elegir foto del móvil</span>
                  <input type="file" accept="image/*" onChange={handleFilePick} className="hidden" />
                </label>
              </div>
            </div>
          )}

          {mode === 'crop' && rawImageSrc && (
            <div className="space-y-4">
              <div
                ref={cropContainerRef}
                onPointerMove={handlePointerMove}
                onPointerUp={() => setDraggingIdx(null)}
                onPointerLeave={() => setDraggingIdx(null)}
                className="relative select-none touch-none rounded-xl overflow-hidden bg-black"
              >
                <img src={rawImageSrc} alt="Captura para recortar" className="w-full h-auto block" />
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                >
                  <polygon
                    points={corners.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')}
                    fill="rgba(214, 195, 165, 0.14)"
                    stroke="#D6C3A5"
                    strokeWidth="0.7"
                  />
                </svg>
                {corners.map((pt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onPointerDown={() => setDraggingIdx(idx)}
                    style={{ left: `${pt.x * 100}%`, top: `${pt.y * 100}%` }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-[#D6C3A5] border-2 border-[#141518] shadow-md cursor-grab active:cursor-grabbing"
                    aria-label={`Esquina ${idx + 1}`}
                  />
                ))}
              </div>

              <label className="flex items-center gap-2.5 text-sm text-[#E8E2D6] cursor-pointer">
                <input
                  type="checkbox"
                  checked={bwMode}
                  onChange={(e) => setBwMode(e.target.checked)}
                  className="w-4 h-4 accent-[#D6C3A5]"
                />
                <span>Mejorar contraste en blanco y negro (recomendado para texto)</span>
              </label>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setMode('camera')}
                  className="min-h-[48px] px-4 rounded-xl border border-white/20 text-sm font-medium inline-flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Repetir</span>
                </button>
                <button
                  type="button"
                  onClick={applyPerspectiveCrop}
                  className="flex-1 min-h-[48px] rounded-xl bg-[#D6C3A5] text-[#141518] text-sm font-semibold inline-flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>Enderezar y continuar</span>
                </button>
              </div>
            </div>
          )}

          {mode === 'preview' && processedDataUrl && (
            <div className="space-y-4">
              <img
                src={processedDataUrl}
                alt="Documento escaneado"
                className="w-full max-h-72 object-contain rounded-xl bg-white"
              />
              <div>
                <label className="block text-xs text-[#CEC8BC] mb-1">Nombre del documento</label>
                <input
                  type="text"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-[#F6F4EF]"
                />
              </div>
              {statusNote && (
                <p className="text-xs text-[#D6C3A5]">{statusNote}</p>
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setMode('crop')}
                  disabled={busy}
                  className="min-h-[48px] px-4 rounded-xl border border-white/20 text-sm font-medium"
                >
                  Ajustar esquinas
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={busy}
                  className="flex-1 min-h-[48px] rounded-xl bg-[#D6C3A5] text-[#141518] text-sm font-semibold disabled:opacity-60"
                >
                  {busy ? 'Guardando...' : 'Guardar documento'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
