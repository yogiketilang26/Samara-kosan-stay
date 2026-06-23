import React from 'react';

interface LoaderProps {
  label?: string;
}

export const Loader: React.FC<LoaderProps> = ({ label = 'Loading..' }) => {
  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-3">
      <div className="w-8 h-8 rounded-full border-2 border-slate-700 border-t-amber-500 animate-spin" />
      <span className="text-xs text-slate-400 font-mono tracking-wider animate-pulse">{label}</span>
    </div>
  );
};

export default Loader;
