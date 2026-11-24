import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'Ha ocurrido un error inesperado.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#FAF8F5] text-[#1C1E22] flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl bg-white border border-[#E7E2D8] p-6 space-y-4">
            <h1 className="font-display text-3xl font-semibold text-[#141518]">
              Algo no ha salido como esperábamos
            </h1>
            <p className="text-sm text-[#5B5E65] leading-relaxed">
              Puedes recargar la página para continuar con tus trámites. Tus datos guardados están a
              salvo.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-[44px] px-5 rounded-xl bg-[#141518] text-[#F6F4EF] text-sm font-semibold"
            >
              Recargar aplicación
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
