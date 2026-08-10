import React from 'react';

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '', style }) => {
  return (
    <div
      style={style}
      className={`animate-pulse bg-slate-200/80 rounded-xl ${className}`}
    />
  );
};

export const BookingSkeletonList: React.FC<{ count?: number }> = ({ count = 3 }) => {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white border border-[#E2E8F0] p-5 rounded-[20px] space-y-4 shadow-xs text-left"
        >
          <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
            <div className="space-y-2 flex-1 w-full">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-28 rounded-lg" />
                <Skeleton className="h-4 w-32 rounded-md" />
              </div>
              <Skeleton className="h-5 w-48 rounded-lg" />
              <Skeleton className="h-4 w-64 rounded-md" />
              <Skeleton className="h-4 w-52 rounded-md" />
            </div>
            <div className="flex sm:flex-col justify-between sm:justify-start items-start sm:items-end gap-2 shrink-0 w-full sm:w-auto">
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-6 w-32 rounded-lg" />
            </div>
          </div>
          <div className="pt-3 border-t border-[#F1F5F9] flex justify-between items-center gap-2">
            <Skeleton className="h-4 w-40 rounded-md" />
            <Skeleton className="h-7 w-28 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
};

export const LedgerSkeletonTable: React.FC<{ rows?: number }> = ({ rows = 6 }) => {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-3.5 px-3 border-b border-gray-100">
          <Skeleton className="h-4 w-20 rounded-md" />
          <Skeleton className="h-4 w-24 rounded-md" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-4 w-3/4 rounded-md" />
            <Skeleton className="h-3 w-1/4 rounded-md" />
          </div>
          <div className="w-28 space-y-1">
            <Skeleton className="h-3 w-12 rounded-md" />
            <Skeleton className="h-4 w-24 rounded-md" />
          </div>
          <Skeleton className="h-4 w-20 rounded-md text-right" />
          <Skeleton className="h-4 w-20 rounded-md text-right" />
          <Skeleton className="h-4 w-24 rounded-md text-right" />
        </div>
      ))}
    </div>
  );
};

export const CoaSkeletonList: React.FC<{ count?: number }> = ({ count = 5 }) => {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex justify-between items-center p-2.5 bg-slate-50 rounded-xl">
          <div className="space-y-1">
            <Skeleton className="h-3 w-12 rounded-md" />
            <Skeleton className="h-4 w-32 rounded-md" />
          </div>
          <Skeleton className="h-5 w-20 rounded-lg" />
        </div>
      ))}
    </div>
  );
};
