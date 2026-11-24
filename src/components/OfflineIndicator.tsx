import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-20 md:bottom-5 left-4 right-4 md:left-auto md:right-5 z-50 flex items-center gap-2.5 rounded-xl bg-[#1C1E22] border border-[#D6C3A5]/40 px-4 py-2.5 text-xs font-medium text-[#F5F2EC] shadow-lg max-w-md"
    >
      <WifiOff className="w-4 h-4 text-[#D6C3A5] shrink-0" />
      <span>Sin conexión — Puedes seguir consultando tus casos y trámites guardados.</span>
    </div>
  );
};
