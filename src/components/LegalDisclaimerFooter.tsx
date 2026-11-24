import React from 'react';
import { Scale } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

interface LegalDisclaimerFooterProps {
  variant?: 'dark' | 'light';
}

export const LegalDisclaimerFooter: React.FC<LegalDisclaimerFooterProps> = ({ variant = 'light' }) => {
  const isDark = variant === 'dark';
  return (
    <footer
      className={
        isDark
          ? 'border-t border-white/10 bg-[#121316] text-[#B8B2A6]'
          : 'border-t border-[#E7E2D8] bg-[#F5F2EC] text-[#5B5E65]'
      }
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-start gap-3 max-w-2xl">
          <Scale
            className={`w-4 h-4 mt-0.5 shrink-0 ${isDark ? 'text-[#D6C3A5]' : 'text-[#8F754B]'}`}
          />
          <p className="text-xs leading-relaxed">
            <strong className={isDark ? 'text-[#F5F2EC]' : 'text-[#1C1E22]'}>
              Aviso importante:
            </strong>{' '}
            «Después del adiós» es una herramienta de organización e información práctica tras un
            fallecimiento en España. No presta ni sustituye el asesoramiento jurídico, fiscal o
            notarial profesional.
          </p>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <PWAInstallButton variant={variant} />
          <span className="text-xs opacity-80 whitespace-nowrap">
            España · Uso privado y familiar
          </span>
        </div>
      </div>
    </footer>
  );
};
