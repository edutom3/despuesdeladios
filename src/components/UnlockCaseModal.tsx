import React, { useState } from 'react';
import { CheckCircle2, CreditCard, ExternalLink, Lock, X } from 'lucide-react';
import { CASE_PRICE_LABEL, type PendingCasePayment } from '../config/pricing';
import { auth } from '../firebase';
import { unlockCaseWithStripeProof } from '../services/firestoreService';
import type { BereavementCase } from '../types/domain';

interface UnlockCaseModalProps {
  bereavementCase?: BereavementCase | null;
  onClose: () => void;
  onUnlocked?: (message: string) => void;
  onNewCasePaid?: (payment: PendingCasePayment) => void;
}

async function readApiJson<T>(resp: Response): Promise<{ ok: boolean; data: T | null; rawText: string }> {
  const rawText = await resp.text();
  try {
    const data = JSON.parse(rawText) as T;
    return { ok: resp.ok, data, rawText };
  } catch {
    return { ok: resp.ok, data: null, rawText };
  }
}

export const UnlockCaseModal: React.FC<UnlockCaseModalProps> = ({
  bereavementCase,
  onClose,
  onUnlocked,
  onNewCasePaid,
}) => {
  const isNewCaseMode = !bereavementCase;
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

  const handleStartStripe = async () => {
    setError(null);
    setStripeExternalUrl(null);
    setStripeBusy(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        throw new Error('Tu sesión no está activa. Vuelve a iniciar sesión con Google.');
      }
      const targetCaseId = bereavementCase?.id || 'new_case';
      const resp = await fetch('/api/payments/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          caseId: targetCaseId,
          deceasedName: bereavementCase?.deceasedName || 'Nuevo caso',
          returnOrigin: window.location.origin,
        }),
      });

      const parsed = await readApiJson<{
        mode?: 'stripe_redirect' | 'test_card';
        url?: string;
        error?: string;
      }>(resp);

      if (!parsed.data) {
        if (resp.status === 404) {
          throw new Error(
            'El servidor de pagos (/api/payments/create-checkout) no respondió en este despliegue. Redespliega la aplicación tras guardar la configuración de API.'
          );
        }
        throw new Error(
          `El servidor de pagos devolvió una respuesta inesperada (${resp.status}). Inténtalo de nuevo en unos segundos.`
        );
      }

      if (!parsed.ok) {
        throw new Error(parsed.data.error || 'No se pudo iniciar el pago.');
      }

      if (parsed.data.mode === 'stripe_redirect' && parsed.data.url) {
        if (isInIframe) {
          setStripeExternalUrl(parsed.data.url);
          return;
        }
        window.location.assign(parsed.data.url);
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
      if (!token) {
        throw new Error('Tu sesión no está activa. Vuelve a iniciar sesión con Google.');
      }
      const targetCaseId = bereavementCase?.id || 'new_case';
      const resp = await fetch('/api/payments/verify-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          caseId: targetCaseId,
          testCardLast4: digits.slice(-4),
        }),
      });

      const parsed = await readApiJson<{
        verified?: boolean;
        receiptId?: string;
        error?: string;
      }>(resp);

      if (!parsed.data) {
        throw new Error(
          `No se pudo verificar el pago en el servidor (${resp.status}). Comprueba el despliegue del servidor.`
        );
      }

      if (!parsed.ok || !parsed.data.verified || !parsed.data.receiptId) {
        throw new Error(parsed.data.error || 'No se pudo confirmar el pago.');
      }
      if (isNewCaseMode) {
        onNewCasePaid?.({
          method: 'stripe',
          codeOrReceipt: parsed.data.receiptId,
          paidAt: new Date().toISOString(),
        });
      } else if (bereavementCase) {
        await unlockCaseWithStripeProof(bereavementCase.id, parsed.data.receiptId);
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
              {isNewCaseMode ? 'Pago necesario para empezar' : 'Pago para acceder al caso completo'}
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

        {/* Stripe one-time upfront payment */}
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
      </div>
    </div>
  );
};
