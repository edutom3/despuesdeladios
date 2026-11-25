import React, { useState } from 'react';
import { CheckCircle2, CreditCard, ExternalLink, KeyRound, Lock, X } from 'lucide-react';
import { CASE_PRICE_LABEL, type PendingCasePayment } from '../config/pricing';
import { auth } from '../firebase';
import {
  redeemPartnerCodeOnCase,
  unlockCaseWithStripeProof,
  validatePartnerCodeAvailable,
} from '../services/firestoreService';
import type { BereavementCase } from '../types/domain';

interface UnlockCaseModalProps {
  bereavementCase?: BereavementCase | null;
  onClose: () => void;
  onUnlocked?: (message: string) => void;
  onNewCasePaid?: (payment: PendingCasePayment) => void;
}

export const UnlockCaseModal: React.FC<UnlockCaseModalProps> = ({
  bereavementCase,
  onClose,
  onUnlocked,
  onNewCasePaid,
}) => {
  const isNewCaseMode = !bereavementCase;
  const [partnerCode, setPartnerCode] = useState('');
  const [codeBusy, setCodeBusy] = useState(false);
  const [stripeBusy, setStripeBusy] = useState(false);
  const [showTestCardForm, setShowTestCardForm] = useState(false);
  const [stripeExternalUrl, setStripeExternalUrl] = useState<string | null>(null);
  const [cardNumber, setCardNumber] = useState('4242 4242 4242 4242');
  const [cardExpiry, setCardExpiry] = useState('12/29');
  const [cardCvc, setCardCvc] = useState('424');
  const [error, setError] = useState<string | null>(null);

  const isInIframe = (() => {
    try {
      return typeof window !== 'undefined' && window.self !== window.top;
    } catch {
      return true;
    }
  })();

  const handleRedeemCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!partnerCode.trim()) {
      setError('Introduce el código que te facilitó tu funeraria o aseguradora.');
      return;
    }
    setCodeBusy(true);
    try {
      if (isNewCaseMode) {
        const res = await validatePartnerCodeAvailable(partnerCode);
        onNewCasePaid?.({
          method: 'partner_code',
          codeOrReceipt: res.code,
          partnerName: res.partnerName,
          paidAt: new Date().toISOString(),
        });
      } else if (bereavementCase) {
        const res = await redeemPartnerCodeOnCase(bereavementCase, partnerCode);
        onUnlocked?.(`Caso activado con éxito (${res.partnerName}).`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo validar ese código.');
    } finally {
      setCodeBusy(false);
    }
  };

  const handleStartStripe = async () => {
    setError(null);
    setStripeExternalUrl(null);
    setStripeBusy(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const targetCaseId = bereavementCase?.id || 'new_case';
      const resp = await fetch('/api/payments/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || ''}`,
        },
        body: JSON.stringify({
          caseId: targetCaseId,
          deceasedName: bereavementCase?.deceasedName || 'Nuevo caso',
          returnOrigin: window.location.origin,
        }),
      });
      const data = (await resp.json()) as {
        mode?: 'stripe_redirect' | 'test_card';
        url?: string;
        error?: string;
      };
      if (!resp.ok) {
        throw new Error(data.error || 'No se pudo iniciar el pago.');
      }
      if (data.mode === 'stripe_redirect' && data.url) {
        if (isInIframe) {
          setStripeExternalUrl(data.url);
          return;
        }
        window.location.assign(data.url);
        return;
      }
      setShowTestCardForm(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al conectar con Stripe.');
    } finally {
      setStripeBusy(false);
    }
  };

  const handleConfirmTestCard = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const digits = cardNumber.replace(/\s+/g, '');
    if (digits.length < 12) {
      setError('Introduce un número de tarjeta válido.');
      return;
    }
    setStripeBusy(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const targetCaseId = bereavementCase?.id || 'new_case';
      const resp = await fetch('/api/payments/verify-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || ''}`,
        },
        body: JSON.stringify({
          caseId: targetCaseId,
          testCardLast4: digits.slice(-4),
        }),
      });
      const data = (await resp.json()) as { verified?: boolean; receiptId?: string; error?: string };
      if (!resp.ok || !data.verified || !data.receiptId) {
        throw new Error(data.error || 'No se pudo confirmar el pago de prueba.');
      }
      if (isNewCaseMode) {
        onNewCasePaid?.({
          method: 'stripe',
          codeOrReceipt: data.receiptId,
          paidAt: new Date().toISOString(),
        });
      } else if (bereavementCase) {
        await unlockCaseWithStripeProof(bereavementCase.id, data.receiptId);
        onUnlocked?.('Pago completado. Todo el caso está activo para ti y tu familia.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al validar la tarjeta.');
    } finally {
      setStripeBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl bg-white border border-[#E7E2D8] p-6 shadow-xl my-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-[#8F754B] inline-flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              {isNewCaseMode ? 'Activar acceso para empezar' : 'Activar el caso completo'}
            </p>
            <h2 className="font-display text-3xl font-semibold text-[#141518] mt-1">
              {isNewCaseMode ? 'Abrir un caso nuevo' : bereavementCase.deceasedName}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[#5E626A] hover:bg-[#F5F1EA]"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <ul className="mt-4 space-y-2 text-sm text-[#45484F]">
          <li className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#7D633A] shrink-0" />
            <span>Cuestionario guiado, todos los trámites detallados y notas por comunidad.</span>
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#7D633A] shrink-0" />
            <span>Calendario completo, avisos automáticos, escáner móvil y resumen en PDF.</span>
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#7D633A] shrink-0" />
            <span>Invitaciones para toda la familia, modelos de escritos y asistente de dudas.</span>
          </li>
        </ul>

        {error && (
          <div className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* Option 1: Stripe one-time upfront payment */}
        <div className="mt-6 rounded-xl border border-[#E7E2D8] bg-[#FAF8F5] p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-[#141518]">Pago único para toda la familia</p>
              <p className="text-xs text-[#666A73]">Acceso inmediato, sin suscripciones ni cuotas.</p>
            </div>
            <span className="font-display text-3xl font-semibold text-[#141518] font-mono-num">
              {CASE_PRICE_LABEL}
            </span>
          </div>

          {stripeExternalUrl ? (
            <div className="mt-4 space-y-2.5 border-t border-[#E7E2D8] pt-4">
              <p className="text-xs text-[#5B5E65]">
                La pasarela segura de Stripe se abrirá en una pestaña nueva para completar el pago.
              </p>
              <a
                href={stripeExternalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full min-h-[48px] rounded-xl bg-[#8F754B] text-white text-sm font-semibold hover:bg-[#7A633E] transition-colors inline-flex items-center justify-center gap-2"
              >
                <span>Continuar al pago seguro ({CASE_PRICE_LABEL})</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          ) : !showTestCardForm ? (
            <button
              type="button"
              onClick={() => void handleStartStripe()}
              disabled={stripeBusy}
              className="mt-4 w-full min-h-[48px] rounded-xl bg-[#141518] text-[#F6F4EF] text-sm font-semibold hover:bg-[#25272D] transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <CreditCard className="w-4 h-4 text-[#D6C3A5]" />
              <span>
                {stripeBusy
                  ? 'Conectando con Stripe...'
                  : `Pagar ${CASE_PRICE_LABEL} con tarjeta (Stripe)`}
              </span>
            </button>
          ) : (
            <form onSubmit={handleConfirmTestCard} className="mt-4 space-y-3 border-t border-[#E7E2D8] pt-4">
              <p className="text-xs text-[#6E6A63]">
                Pasarela Stripe en modo de prueba. Usa la tarjeta <strong>4242 4242 4242 4242</strong>.
              </p>
              <input
                type="text"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                placeholder="Número de tarjeta"
                className="w-full min-h-[44px] rounded-lg border border-[#D8D0C2] bg-white px-3 text-sm font-mono-num"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={cardExpiry}
                  onChange={(e) => setCardExpiry(e.target.value)}
                  placeholder="MM/AA"
                  className="w-full min-h-[44px] rounded-lg border border-[#D8D0C2] bg-white px-3 text-sm font-mono-num"
                />
                <input
                  type="text"
                  value={cardCvc}
                  onChange={(e) => setCardCvc(e.target.value)}
                  placeholder="CVC"
                  className="w-full min-h-[44px] rounded-lg border border-[#D8D0C2] bg-white px-3 text-sm font-mono-num"
                />
              </div>
              <button
                type="submit"
                disabled={stripeBusy}
                className="w-full min-h-[44px] rounded-xl bg-[#8F754B] text-white text-sm font-semibold hover:bg-[#7A633E]"
              >
                {stripeBusy ? 'Confirmando pago...' : `Confirmar pago de prueba (${CASE_PRICE_LABEL})`}
              </button>
            </form>
          )}
        </div>

        {/* Option 2: Partner Code */}
        <form onSubmit={handleRedeemCode} className="mt-5 pt-5 border-t border-[#E7E2D8] space-y-3">
          <label htmlFor="partnerCodeInput" className="block text-sm font-medium text-[#1C1E22]">
            ¿Tienes un código de funeraria o aseguradora?
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <KeyRound className="w-4 h-4 text-[#7A7D85] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="partnerCodeInput"
                type="text"
                value={partnerCode}
                onChange={(e) => setPartnerCode(e.target.value)}
                placeholder="Introduce tu código"
                className="w-full min-h-[44px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] pl-10 pr-3 text-sm uppercase font-mono-num focus:outline-none focus:border-[#8F754B]"
              />
            </div>
            <button
              type="submit"
              disabled={codeBusy}
              className="min-h-[44px] px-4 rounded-xl border border-[#141518] bg-white text-sm font-semibold text-[#141518] hover:bg-[#F5F1EA] shrink-0"
            >
              {codeBusy ? 'Validando...' : 'Aplicar código'}
            </button>
          </div>
          <p className="text-xs text-[#6E6A63]">
            Si tu funeraria o seguro cubre la gestión, introduce su código para activar el caso sin
            coste adicional.
          </p>
        </form>
      </div>
    </div>
  );
};
