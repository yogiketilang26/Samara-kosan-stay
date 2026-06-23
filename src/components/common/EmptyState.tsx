import React from 'react';
import { Compass } from 'lucide-react';

interface EmptyStateProps {
  message: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ message }) => {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center space-y-2.5 bg-slate-900 border border-slate-800 rounded-3xl">
      <div className="p-3 bg-slate-850 border border-slate-750 text-amber-500 rounded-full animate-bounce">
        <Compass size={24} />
      </div>
      <p className="text-slate-400 text-xs font-sans max-w-sm leading-relaxed">{message}</p>
    </div>
  );
};

export default EmptyState;
