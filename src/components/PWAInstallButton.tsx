import React, { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'dark' | 'light';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'light' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const buttonClass =
    variant === 'dark'
      ? 'inline-flex items-center gap-2 rounded-xl border border-[#D6C3A5]/40 bg-[#1E2025] px-3.5 py-2 text-xs font-medium text-[#F5F2EC] hover:bg-[#272A30] transition-colors min-h-[40px] whitespace-nowrap shrink-0'
      : 'inline-flex items-center gap-2 rounded-xl border border-[#DDD5C7] bg-white px-3.5 py-2 text-xs font-medium text-[#2A2C30] hover:bg-[#F5F1EA] transition-colors min-h-[40px] whitespace-nowrap shrink-0';

  if (isInstallable) {
    return (
      <button onClick={() => void install()} className={buttonClass} type="button">
        <Download className="w-4 h-4 text-[#B59867]" />
        <span>Instalar app</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button onClick={() => setShowIOSGuide(true)} className={buttonClass} type="button">
          <Share className="w-4 h-4 text-[#B59867]" />
          <span>Instalar en iPhone</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl border border-[#E7E2D8] text-[#1C1E22]">
              <div className="flex items-start justify-between gap-4">
                <h3 className="font-display text-2xl font-semibold">Instalar en iPhone o iPad</h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[#5E626A] hover:bg-[#F5F1EA]"
                  aria-label="Cerrar guía"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <ol className="mt-4 space-y-2.5 text-sm text-[#45484F] leading-relaxed list-decimal list-inside">
                <li>
                  Pulsa el botón <strong>Compartir</strong> en la barra inferior de Safari.
                </li>
                <li>
                  Desliza hacia abajo y elige <strong>Añadir a pantalla de inicio</strong>.
                </li>
                <li>
                  Pulsa <strong>Añadir</strong> para consultar tus trámites incluso sin cobertura.
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-6 w-full min-h-[44px] rounded-xl bg-[#141518] text-[#F5F2EC] text-sm font-medium hover:bg-[#23252B] transition-colors"
              >
                Entendido
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
