import React from 'react';
import { ArrowRight, CalendarClock, CheckCircle2, ExternalLink, FileText, ShieldCheck, Users } from 'lucide-react';
import { LegalDisclaimerFooter } from './LegalDisclaimerFooter';
import { PWAInstallButton } from './PWAInstallButton';

interface LandingViewProps {
  onStartLogin: () => void;
  authLoading: boolean;
  authError: string | null;
  showNewTabAuthHelp?: boolean;
}

export const LandingView: React.FC<LandingViewProps> = ({
  onStartLogin,
  authLoading,
  authError,
  showNewTabAuthHelp = false,
}) => {
  return (
    <div className="min-h-screen flex flex-col bg-[#121316] text-[#F6F4EF]">
      {/* Top Bar Contract: 3 zones (Brand — Nav links — 1 Primary CTA) */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#121316]/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#inicio"
            className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-[#F6F4EF] whitespace-nowrap shrink-0"
          >
            Después del adiós
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm text-[#CEC8BC]">
            <a href="#como-funciona" className="hover:text-[#F6F4EF] transition-colors whitespace-nowrap shrink-0">
              Cómo funciona
            </a>
            <a href="#que-incluye" className="hover:text-[#F6F4EF] transition-colors whitespace-nowrap shrink-0">
              Qué incluye
            </a>
            <a href="#familia" className="hover:text-[#F6F4EF] transition-colors whitespace-nowrap shrink-0">
              En familia
            </a>
            <a href="#aviso-legal" className="hover:text-[#F6F4EF] transition-colors whitespace-nowrap shrink-0">
              Aviso legal
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onStartLogin}
              disabled={authLoading}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-[#D6C3A5] text-[#141518] text-sm font-semibold hover:bg-[#E3D3B8] transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              {authLoading ? 'Entrando...' : 'Abrir mi caso'}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main id="inicio" className="flex-1">
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-14 lg:pt-16 lg:pb-20">
          <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center">
              <p className="text-xs sm:text-sm text-[#D6C3A5] tracking-wide mb-3">
                Guía práctica en España · Sin jerga jurídica
              </p>
              <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.35rem] font-semibold leading-[1.08] tracking-tight text-[#F6F4EF]">
                Un lugar tranquilo para ordenar cada trámite, paso a paso.
              </h1>
              <p className="mt-5 text-base sm:text-lg text-[#CFC9BE] leading-relaxed max-w-xl">
                Cuando fallece un ser querido, todo llega a la vez. Responde unas preguntas sencillas
                y obtén una lista clara con qué hacer primero, plazos por comunidad autónoma y una
                carpeta privada compartida con tu familia.
              </p>

              {authError && (
                <div className="mt-5 rounded-xl border border-amber-400/40 bg-amber-950/40 px-4 py-3.5 text-sm text-amber-100 space-y-3">
                  <p className="leading-relaxed">{authError}</p>
                  {showNewTabAuthHelp && (
                    <a
                      href={typeof window !== 'undefined' ? window.location.href : '/'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[40px] px-4 py-2 rounded-lg bg-[#D6C3A5] text-[#141518] text-xs font-semibold hover:bg-[#E4D5BC] inline-flex items-center gap-2 whitespace-nowrap"
                    >
                      <span>Abrir en pestaña nueva para entrar</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              )}

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={onStartLogin}
                  disabled={authLoading}
                  className="min-h-[48px] px-6 py-3 rounded-xl bg-[#D6C3A5] text-[#141518] text-base font-semibold hover:bg-[#E4D5BC] transition-colors inline-flex items-center gap-2.5"
                >
                  <span>{authLoading ? 'Abriendo acceso...' : 'Abrir mi caso con Google'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <PWAInstallButton variant="dark" />
              </div>

              <div className="mt-6 pt-5 border-t border-white/10 text-xs text-[#A8A297] leading-relaxed">
                Herramienta de organización e información práctica. No ofrece ni sustituye el
                asesoramiento jurídico, fiscal o notarial. Cuestionario inicial y los 5 trámites más
                urgentes siempre gratuitos.
              </div>
            </div>

            <div className="lg:col-span-6 flex">
              <div className="relative w-full min-h-[280px] sm:min-h-[360px] rounded-2xl overflow-hidden border border-white/10 bg-[#1B1D22]">
                <img
                  src="/src/assets/images/hero_hands_support_1795434770071.jpg"
                  alt="Manos acompañando con serenidad sobre una mesa de lino"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#121316]/80 via-[#121316]/20 to-transparent" />
                <div className="absolute bottom-5 left-5 right-5 flex items-center justify-between text-xs text-[#E8E2D6]">
                  <span>Guardado privado por caso</span>
                  <span>19 comunidades y ciudades autónomas</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="como-funciona" className="border-t border-white/10 bg-[#17191D] py-14 sm:py-16">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="max-w-2xl">
              <h2 className="font-display text-3xl sm:text-4xl font-semibold text-[#F6F4EF]">
                Cómo os acompaña la aplicación
              </h2>
              <p className="mt-3 text-sm sm:text-base text-[#C4BEB3]">
                Sin prisas ni formularios interminables. Puedes cambiar cualquier respuesta más
                adelante y la lista se adapta sola.
              </p>
            </div>

            <div className="mt-10 grid md:grid-cols-3 gap-6">
              <div className="rounded-2xl border border-white/10 bg-[#121316] p-6">
                <p className="text-xs text-[#D6C3A5] font-mono-num">01 · Cuestionario breve</p>
                <h3 className="mt-2 text-lg font-semibold text-[#F6F4EF]">
                  Cuatro pasos sencillos
                </h3>
                <p className="mt-2 text-sm text-[#B8B2A6] leading-relaxed">
                  Responde con botones grandes «Sí / No / No lo sé» sobre testamento, vivienda,
                  cuentas, pensión, seguros o hijos menores.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#121316] p-6">
                <p className="text-xs text-[#D6C3A5] font-mono-num">02 · Lista y calendario</p>
                <h3 className="mt-2 text-lg font-semibold text-[#F6F4EF]">
                  Qué hacer primero y plazos
                </h3>
                <p className="mt-2 text-sm text-[#B8B2A6] leading-relaxed">
                  Calculamos cada fecha desde el día del fallecimiento, avisando de los vencimientos
                  de los próximos 14 días y las normas de tu comunidad.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#121316] p-6">
                <p className="text-xs text-[#D6C3A5] font-mono-num">03 · Familia y papeles</p>
                <h3 className="mt-2 text-lg font-semibold text-[#F6F4EF]">
                  Reparto y carpeta privada
                </h3>
                <p className="mt-2 text-sm text-[#B8B2A6] leading-relaxed">
                  Invita a familiares para repartir tareas, dejar notas, escanear documentos con la
                  cámara del móvil y descargar todo en PDF.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Visual Editorial Split */}
        <section id="que-incluye" className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-16">
          <div className="grid lg:grid-cols-12 gap-8 items-stretch">
            <div className="lg:col-span-5 rounded-2xl overflow-hidden border border-white/10 bg-[#1B1D22] min-h-[260px]">
              <img
                src="/src/assets/images/calm_window_flowers_1795434770597.jpg"
                alt="Ramas de olivo junto a una ventana soleada"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>

            <div className="lg:col-span-7 flex flex-col justify-center space-y-6">
              <h2 className="font-display text-3xl sm:text-4xl font-semibold text-[#F6F4EF]">
                Pensada para usarse en el móvil, en cualquier momento
              </h2>
              <div className="grid sm:grid-cols-2 gap-5">
                <div className="flex items-start gap-3">
                  <CalendarClock className="w-5 h-5 text-[#D6C3A5] shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-semibold text-[#F6F4EF]">Plazos legales claros</h3>
                    <p className="mt-1 text-xs sm:text-sm text-[#B8B2A6] leading-relaxed">
                      Distingue entre fechas legales obligatorias (como los 6 meses de Sucesiones o
                      90 días en Tráfico) y plazos orientativos.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <FileText className="w-5 h-5 text-[#D6C3A5] shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-semibold text-[#F6F4EF]">Escáner y PDF</h3>
                    <p className="mt-1 text-xs sm:text-sm text-[#B8B2A6] leading-relaxed">
                      Fotografía certificados con recorte de esquinas, guarda copias privadas y
                      descarga el resumen completo en PDF.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Users className="w-5 h-5 text-[#D6C3A5] shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-semibold text-[#F6F4EF]">Colaboración real</h3>
                    <p className="mt-1 text-xs sm:text-sm text-[#B8B2A6] leading-relaxed">
                      Asigna quién se encarga de cada gestión y elige si cada familiar puede
                      colaborar o solo consultar el avance.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-[#D6C3A5] shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-semibold text-[#F6F4EF]">Modo sin conexión</h3>
                    <p className="mt-1 text-xs sm:text-sm text-[#B8B2A6] leading-relaxed">
                      Instálala en la pantalla de inicio para revisar tus trámites incluso dentro de
                      registros o edificios sin cobertura.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Family & Pricing Clarity */}
        <section id="familia" className="border-t border-white/10 bg-[#17191D] py-14">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 grid lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7">
              <h2 className="font-display text-3xl font-semibold text-[#F6F4EF]">
                Empieza gratis, desbloquea cuando lo necesites
              </h2>
              <p className="mt-3 text-sm sm:text-base text-[#C4BEB3] leading-relaxed">
                El cuestionario inicial y los 5 trámites más urgentes con su ficha completa son
                gratuitos. Si quieres desbloquear todos los trámites, el calendario completo, la
                subida de documentos, las invitaciones familiares y los modelos de escritos, puedes
                hacerlo con un pago único de <strong className="text-[#F6F4EF]">29 €</strong> por
                caso o con un código de tu funeraria o aseguradora.
              </p>
              <div className="mt-6 flex flex-wrap gap-5 text-xs sm:text-sm text-[#D6C3A5]">
                <span className="inline-flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> Sin suscripciones mensuales
                </span>
                <span className="inline-flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> Un solo pago sirve para toda la familia
                </span>
              </div>
            </div>

            <div className="lg:col-span-5 rounded-2xl overflow-hidden border border-white/10 bg-[#121316]">
              <img
                src="/src/assets/images/paper_archive_folder_1795434769695.jpg"
                alt="Carpetas archivadoras ordenadas sobre una mesa"
                referrerPolicy="no-referrer"
                className="w-full h-52 object-cover"
              />
              <div className="p-5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-[#F6F4EF]">¿Listo para empezar?</p>
                  <p className="text-xs text-[#B8B2A6]">Tu caso se guarda de forma privada.</p>
                </div>
                <button
                  type="button"
                  onClick={onStartLogin}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-[#D6C3A5] text-[#141518] text-sm font-semibold hover:bg-[#E3D3B8] transition-colors shrink-0"
                >
                  Abrir mi caso
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <div id="aviso-legal">
        <LegalDisclaimerFooter variant="dark" />
      </div>
    </div>
  );
};
