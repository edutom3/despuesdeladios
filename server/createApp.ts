import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import Stripe from 'stripe';
import {
  buildWarmGeneralEmail,
  deleteCaseSchedule,
  dispatchViaResend,
  evaluateCaseRemindersNow,
  getCaseReminderStatus,
  isResendConfigured,
  isValidEmail,
  runManualOrTestReminder,
  upsertCaseSchedule,
  type SyncedProcedureDeadline,
} from './remindersService.ts';

function loadFirebaseConfig(): { projectId: string } {
  const candidates = [
    path.resolve(process.cwd(), 'firebase-applet-config.json'),
    path.resolve(import.meta.dirname, '..', 'firebase-applet-config.json'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return JSON.parse(fs.readFileSync(candidate, 'utf-8')) as { projectId: string };
    }
  }
  throw new Error('No se encontró firebase-applet-config.json en el servidor.');
}

const firebaseConfig = loadFirebaseConfig();
const GEMINI_MODEL = 'gemini-4-hydrogen';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// --- Lightweight Firebase ID Token Verification (no IAM needed) ---
let cachedCerts: Record<string, string> = {};
let certsExpiresAt = 0;

async function getGooglePublicCerts(): Promise<Record<string, string>> {
  if (Date.now() < certsExpiresAt && Object.keys(cachedCerts).length > 0) {
    return cachedCerts;
  }
  const resp = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
  );
  if (!resp.ok) {
    throw new Error('No se pudieron obtener las claves públicas de autenticación.');
  }
  const cacheControl = resp.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAgeSec = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  cachedCerts = (await resp.json()) as Record<string, string>;
  certsExpiresAt = Date.now() + maxAgeSec * 1000;
  return cachedCerts;
}

interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  emailVerified: boolean;
}

function base64UrlDecode(str: string): Buffer {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(str.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64');
}

async function verifyFirebaseIdToken(token: string): Promise<VerifiedFirebaseUser> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Token inválido.');
  }
  const [headerB64, payloadB64, sigB64] = parts;
  const header = JSON.parse(base64UrlDecode(headerB64).toString('utf-8')) as { alg?: string; kid?: string };
  const payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf-8')) as {
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    email?: string;
    email_verified?: boolean;
  };

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Algoritmo de token no compatible.');
  }
  const expectedIss = `https://securetoken.google.com/${firebaseConfig.projectId}`;
  if (payload.aud !== firebaseConfig.projectId || payload.iss !== expectedIss || !payload.sub) {
    throw new Error('Token no pertenece a este proyecto.');
  }
  if (!payload.exp || payload.exp * 1000 < Date.now()) {
    throw new Error('La sesión ha caducado. Vuelve a iniciar sesión.');
  }

  const certs = await getGooglePublicCerts();
  const cert = certs[header.kid];
  if (!cert) {
    throw new Error('Certificado de firma no encontrado.');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  const signature = base64UrlDecode(sigB64);
  const valid = verifier.verify(cert, signature);
  if (!valid) {
    throw new Error('Firma del token no válida.');
  }

  return {
    uid: payload.sub,
    email: payload.email || '',
    emailVerified: Boolean(payload.email_verified),
  };
}

interface AuthedRequest extends Request {
  authUser?: VerifiedFirebaseUser;
}

async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    res.status(401).json({ error: 'Debes iniciar sesión para continuar.' });
    return;
  }
  try {
    req.authUser = await verifyFirebaseIdToken(match[1]);
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sesión no válida.';
    res.status(401).json({ error: message });
  }
}

export function createApiApp(): express.Express {
  const app = express();
  const jsonParser = express.json({ limit: '8mb' });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.body !== undefined && typeof req.body === 'object' && req.body !== null) {
      next();
      return;
    }
    jsonParser(req, res, next);
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', app: 'despues-del-adios' });
  });

  // --- Step 4: Document basic data extraction via Gemini ---
  app.post('/api/documents/extract', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { dataUrl, mimeType, docHint } = req.body as {
        dataUrl?: string;
        mimeType?: string;
        docHint?: string;
      };

      if (!dataUrl || typeof dataUrl !== 'string') {
        res.status(400).json({ error: 'Falta el archivo para analizar.' });
        return;
      }

      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error: 'La lectura automática no está disponible en este momento; el documento se guardará igualmente.',
        });
        return;
      }

      const base64Match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      const cleanMime = base64Match ? base64Match[1] : (mimeType || 'image/jpeg');
      const base64Data = base64Match ? base64Match[2] : dataUrl;

      const supportedMime =
        cleanMime.startsWith('image/') || cleanMime === 'application/pdf'
          ? cleanMime
          : 'image/jpeg';

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: supportedMime,
                data: base64Data,
              },
            },
            {
              text:
                `Analiza este documento administrativo español (pista de tipo: ${docHint || 'documento general'}). ` +
                `Extrae de forma concisa los datos básicos si son legibles en el documento. ` +
                `Si algún campo no se ve claramente, devuelve cadena vacía "". ` +
                `No inventes datos.`,
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestedTitle: {
                type: Type.STRING,
                description: 'Nombre breve en español del documento detectado.',
              },
              extractedDate: {
                type: Type.STRING,
                description: 'Fecha principal del documento en formato DD/MM/AAAA o vacío.',
              },
              extractedNumber: {
                type: Type.STRING,
                description: 'Número de expediente, registro, póliza, DNI o referencia.',
              },
              extractedIssuer: {
                type: Type.STRING,
                description: 'Organismo, notaría, banco o entidad que expide el documento.',
              },
              extractedSubject: {
                type: Type.STRING,
                description: 'Nombre completo de la persona titular o fallecida a quien se refiere.',
              },
            },
          },
        },
      });

      const rawText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawText) as Record<string, string>;
      res.json({
        suggestedTitle: String(parsed.suggestedTitle || '').slice(0, 140),
        extractedDate: String(parsed.extractedDate || '').slice(0, 40),
        extractedNumber: String(parsed.extractedNumber || '').slice(0, 80),
        extractedIssuer: String(parsed.extractedIssuer || '').slice(0, 140),
        extractedSubject: String(parsed.extractedSubject || '').slice(0, 140),
      });
    } catch (err) {
      console.error('Document extraction error:', err);
      res.status(502).json({
        error: 'No se pudieron leer los datos automáticamente, pero el archivo se puede guardar sin problema.',
      });
    }
  });

  // --- Step 6: AI Assistant strictly limited to reviewed app content ---
  app.post('/api/ai/assistant', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { question, history, caseContext, catalogProcedures } = req.body as {
        question?: string;
        history?: Array<{ role: 'user' | 'model'; text: string }>;
        caseContext?: {
          ccaa?: string;
          deathDate?: string;
          daysSinceDeath?: number;
          answersSummary?: string;
        };
        catalogProcedures?: Array<{
          title: string;
          summary: string;
          whatIsIt: string;
          whereToDoIt: string;
          deadlineText: string;
          regionalNote?: string;
          requiredDocs: string[];
        }>;
      };

      if (!question || typeof question !== 'string' || question.trim().length === 0) {
        res.status(400).json({ error: 'Escribe tu consulta antes de enviarla.' });
        return;
      }

      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error: 'El asistente no está disponible porque falta configurar GEMINI_API_KEY en el servidor.',
        });
        return;
      }

      const reviewedCatalogText = (catalogProcedures || [])
        .slice(0, 35)
        .map(
          (p, i) =>
            `${i + 1}. ${p.title}\n` +
            `   Resumen: ${p.summary}\n` +
            `   Qué es: ${p.whatIsIt}\n` +
            `   Dónde se hace: ${p.whereToDoIt}\n` +
            `   Plazo: ${p.deadlineText}\n` +
            `   Documentos: ${p.requiredDocs.join(', ')}\n` +
            (p.regionalNote ? `   Nota autonómica: ${p.regionalNote}\n` : '')
        )
        .join('\n');

      const systemInstruction =
        `Eres el asistente de orientación práctica de «Después del adiós», una aplicación para ayudar a familiares tras un fallecimiento en España.\n` +
        `REGLAS ESTRICTAS:\n` +
        `1. Habla siempre en español de España, con tono sereno, cálido, respetuoso y sin jerga jurídica innecesaria.\n` +
        `2. LIMÍTATE EXCLUSIVAMENTE al contenido revisado de las fichas de trámites proporcionado abajo y a los datos generales del caso (${caseContext?.ccaa || 'España'}, fecha de fallecimiento ${caseContext?.deathDate || 'no indicada'}). No inventes artículos de ley, cuantías fiscales exactas no indicadas ni procedimientos externos que no figuren en este contenido.\n` +
        `3. Si la pregunta pide asesoramiento jurídico personalizado, interpretación legal compleja, cálculo exacto de impuestos o casos fuera del contenido revisado, indica con amabilidad que la app no cubre ese supuesto concreto y recomienda consultar con un profesional (notaría, abogado de herencias o asesor fiscal).\n` +
        `4. Incluye siempre al final de tu respuesta, en una línea breve y tranquila, el recordatorio: "Nota: Esta orientación se basa en el contenido informativo de «Después del adiós» y no constituye asesoramiento jurídico."\n\n` +
        `DATOS DEL CASO ACTUAL:\n` +
        `- Comunidad Autónoma: ${caseContext?.ccaa || 'No indicada'}\n` +
        `- Días transcurridos desde el fallecimiento: ${caseContext?.daysSinceDeath ?? 'No calculados'}\n` +
        `- Situación marcada: ${caseContext?.answersSummary || 'Sin detallar'}\n\n` +
        `CONTENIDO REVISADO DE LA APLICACIÓN:\n${reviewedCatalogText}`;

      const contents = [
        ...(history || []).slice(-8).map((m) => ({
          role: m.role === 'model' ? 'model' : 'user',
          parts: [{ text: String(m.text || '').slice(0, 2000) }],
        })),
        {
          role: 'user',
          parts: [{ text: question.slice(0, 1500) }],
        },
      ];

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents,
        config: {
          systemInstruction,
        },
      });

      const answer = (response.text ?? '').trim();
      if (!answer) {
        res.status(502).json({ error: 'No se pudo generar una respuesta. Inténtalo de nuevo.' });
        return;
      }

      res.json({ answer });
    } catch (err) {
      console.error('Assistant error:', err);
      res.status(502).json({
        error: 'Ha habido un problema al consultar al asistente. Revisa tu conexión o inténtalo en unos segundos.',
      });
    }
  });

  // --- Step 3: Stripe one-time upfront payment (default 19 EUR, configurable via CASE_PRICE_EUR) ---
  const parsedPrice = Number(process.env.CASE_PRICE_EUR);
  const CASE_PRICE_EUR =
    Number.isFinite(parsedPrice) && parsedPrice >= 1 && parsedPrice <= 500
      ? Math.round(parsedPrice * 100) / 100
      : 19;
  const CASE_PRICE_CENTS = Math.round(CASE_PRICE_EUR * 100);

  app.post('/api/payments/create-checkout', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { caseId, deceasedName, returnOrigin } = req.body as {
        caseId?: string;
        deceasedName?: string;
        returnOrigin?: string;
      };

      const targetCaseId =
        typeof caseId === 'string' && caseId.trim().length > 0 ? caseId.trim() : 'new_case';
      const isNewCaseFlow = targetCaseId === 'new_case';

      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) {
        res.json({
          mode: 'test_card',
          priceEur: CASE_PRICE_EUR,
          caseId: targetCaseId,
        });
        return;
      }

      const stripe = new Stripe(stripeKey);
      const safeOrigin =
        returnOrigin && /^https?:\/\//i.test(returnOrigin)
          ? returnOrigin
          : process.env.APP_URL || 'http://localhost:3000';

      const successUrl = isNewCaseFlow
        ? `${safeOrigin}/?new_case_paid=1&stripe_session_id={CHECKOUT_SESSION_ID}`
        : `${safeOrigin}/?unlock_case=${encodeURIComponent(targetCaseId)}&stripe_session_id={CHECKOUT_SESSION_ID}`;

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: req.authUser?.email || undefined,
        line_items: [
          {
            price_data: {
              currency: 'eur',
              unit_amount: CASE_PRICE_CENTS,
              product_data: {
                name: 'Acceso completo por caso — Después del adiós',
                description: isNewCaseFlow
                  ? 'Acceso completo al cuestionario, trámites personalizados, calendario, documentos, escáner, escritos y colaboración familiar. Pago único.'
                  : `Acceso completo a todos los trámites, calendario, documentos y colaboración familiar para ${deceasedName || 'tu caso'}. Pago único.`,
              },
            },
            quantity: 1,
          },
        ],
        metadata: {
          caseId: targetCaseId,
          uid: req.authUser?.uid || '',
        },
        success_url: successUrl,
        cancel_url: `${safeOrigin}/?unlock_cancelled=${encodeURIComponent(targetCaseId)}`,
      });

      res.json({
        mode: 'stripe_redirect',
        url: session.url,
        sessionId: session.id,
        priceEur: CASE_PRICE_EUR,
      });
    } catch (err) {
      console.error('Stripe checkout error:', err);
      res.status(502).json({ error: 'No se pudo iniciar la pasarela de pago en este momento.' });
    }
  });

  app.post('/api/payments/verify-session', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { sessionId, caseId, testCardLast4 } = req.body as {
        sessionId?: string;
        caseId?: string;
        testCardLast4?: string;
      };

      const targetCaseId =
        typeof caseId === 'string' && caseId.trim().length > 0 ? caseId.trim() : 'new_case';

      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) {
        if (testCardLast4 === '4242' && targetCaseId) {
          res.json({
            verified: true,
            receiptId: `STRIPE_TEST_${Date.now()}`,
            flow: targetCaseId === 'new_case' ? 'new_case' : 'unlock_case',
          });
          return;
        }
        res.status(400).json({ error: 'Tarjeta de prueba no válida. En modo prueba usa 4242 4242 4242 4242.' });
        return;
      }

      if (!sessionId) {
        res.status(400).json({ error: 'Falta el identificador de la sesión de pago.' });
        return;
      }

      const stripe = new Stripe(stripeKey);
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status === 'paid') {
        res.json({
          verified: true,
          receiptId: session.id.slice(0, 60),
          flow: session.metadata?.caseId === 'new_case' ? 'new_case' : 'unlock_case',
        });
      } else {
        res.status(402).json({ error: 'El pago aún no figura como completado.' });
      }
    } catch (err) {
      console.error('Stripe verify error:', err);
      res.status(502).json({ error: 'No se pudo verificar el estado del pago.' });
    }
  });

  // --- Step 3 & 5: Email dispatch for invitations, legal alerts & deadline reminders ---
  app.post('/api/notifications/send-email', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { to, subject, bodyText, kind, appOrigin } = req.body as {
        to?: string;
        subject?: string;
        bodyText?: string;
        kind?: 'invite' | 'reminder' | 'legal_alert';
        appOrigin?: string;
      };

      if (!to || !subject || !bodyText || typeof to !== 'string' || !isValidEmail(to)) {
        res.status(400).json({ error: 'Falta un destinatario válido, el asunto o el mensaje.' });
        return;
      }

      const built = buildWarmGeneralEmail({
        subject,
        bodyText,
        kind: kind || 'reminder',
        appOrigin,
      });

      const result = await dispatchViaResend({
        to: to.trim(),
        subject: built.subject,
        html: built.html,
        text: built.text,
        tags: [
          { name: 'app', value: 'despues-del-adios' },
          { name: 'kind', value: kind || 'reminder' },
        ],
      });

      if (result.status === 'sent') {
        res.json({ dispatched: 'sent', resendId: result.resendId, kind: kind || 'reminder' });
        return;
      }

      if (result.status === 'error') {
        res.status(502).json({
          error: result.errorMessage || 'Resend no pudo enviar el correo en este momento.',
          dispatched: 'error',
        });
        return;
      }

      const mailtoHref = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(built.subject)}&body=${encodeURIComponent(built.text)}`;
      res.json({
        dispatched: 'prepared',
        kind: kind || 'reminder',
        to,
        subject: built.subject,
        bodyText: built.text,
        mailtoHref,
      });
    } catch (err) {
      console.error('Email dispatch error:', err);
      res.status(500).json({ error: 'No se pudo preparar el aviso por correo.' });
    }
  });

  // --- Automated Deadline Reminders (Resend) ---
  app.post('/api/reminders/sync', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const uid = req.authUser?.uid;
      if (!uid) {
        res.status(401).json({ error: 'Sesión no válida.' });
        return;
      }

      const {
        caseId,
        ownerUid,
        memberUids,
        deceasedName,
        ccaa,
        recipientEmail,
        recipientName,
        enabled,
        daysBefore,
        onlyLegalDeadlines,
        appOrigin,
        procedures,
        runAutoCheck,
      } = req.body as {
        caseId?: string;
        ownerUid?: string;
        memberUids?: string[];
        deceasedName?: string;
        ccaa?: string;
        recipientEmail?: string;
        recipientName?: string;
        enabled?: boolean;
        daysBefore?: number;
        onlyLegalDeadlines?: boolean;
        appOrigin?: string;
        procedures?: SyncedProcedureDeadline[];
        runAutoCheck?: boolean;
      };

      if (!caseId) {
        res.status(400).json({ error: 'Falta el identificador del caso.' });
        return;
      }

      if (enabled && recipientEmail && !isValidEmail(recipientEmail)) {
        res.status(400).json({ error: 'La dirección de correo para avisos no es válida.' });
        return;
      }

      const result = upsertCaseSchedule(uid, {
        caseId,
        ownerUid: ownerUid || uid,
        memberUids: Array.isArray(memberUids) ? memberUids : [uid],
        deceasedName: deceasedName || 'Tu familiar',
        ccaa: ccaa || 'España',
        recipientEmail: recipientEmail || '',
        recipientName: recipientName || '',
        enabled: Boolean(enabled),
        daysBefore: Number(daysBefore) || 7,
        onlyLegalDeadlines: Boolean(onlyLegalDeadlines),
        appOrigin,
        procedures: Array.isArray(procedures) ? procedures : [],
      });

      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }

      let autoDispatchedRecord = null;
      if (runAutoCheck && result.schedule.enabled && isValidEmail(result.schedule.recipientEmail)) {
        autoDispatchedRecord = await evaluateCaseRemindersNow(caseId);
      }

      res.json({
        synced: true,
        resendConfigured: isResendConfigured(),
        schedule: result.schedule,
        autoDispatchedRecord,
      });
    } catch (err) {
      console.error('Reminder sync error:', err);
      res.status(500).json({ error: 'No se pudieron sincronizar los avisos automáticos.' });
    }
  });

  app.get('/api/reminders/status/:caseId', requireAuth, (req: AuthedRequest, res: Response) => {
    const uid = req.authUser?.uid;
    if (!uid) {
      res.status(401).json({ error: 'Sesión no válida.' });
      return;
    }
    const status = getCaseReminderStatus(uid, req.params.caseId);
    if (!status.ok) {
      res.status(status.status).json({ error: status.error });
      return;
    }
    res.json(status);
  });

  app.post('/api/reminders/run-now', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const uid = req.authUser?.uid;
      if (!uid) {
        res.status(401).json({ error: 'Sesión no válida.' });
        return;
      }
      const { caseId, mode, overrideEmail } = req.body as {
        caseId?: string;
        mode?: 'auto_check' | 'manual_summary' | 'test';
        overrideEmail?: string;
      };
      if (!caseId) {
        res.status(400).json({ error: 'Falta el identificador del caso.' });
        return;
      }

      if (mode === 'auto_check') {
        const status = getCaseReminderStatus(uid, caseId);
        if (!status.ok) {
          res.status(status.status).json({ error: status.error });
          return;
        }
        const record = await evaluateCaseRemindersNow(caseId);
        res.json({ ok: true, record });
        return;
      }

      const result = await runManualOrTestReminder({
        caseId,
        callerUid: uid,
        mode: mode === 'test' ? 'test' : 'manual_summary',
        overrideEmail,
      });

      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }

      res.json({
        ok: true,
        record: result.record,
        mailtoHref: result.mailtoHref,
        resendConfigured: isResendConfigured(),
      });
    } catch (err) {
      console.error('Run reminder error:', err);
      res.status(500).json({ error: 'No se pudo ejecutar el envío del aviso.' });
    }
  });

  app.delete('/api/reminders/case/:caseId', requireAuth, (req: AuthedRequest, res: Response) => {
    const uid = req.authUser?.uid;
    if (!uid) {
      res.status(401).json({ error: 'Sesión no válida.' });
      return;
    }
    const result = deleteCaseSchedule(uid, req.params.caseId);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ deleted: true });
  });

  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'Ruta de API no encontrada.' });
  });

  return app;
}
