import React from 'react';

interface TransactionStatusBadgeProps {
  status: 'pending' | 'approved' | 'rejected' | 'survey_confirmed' | 'survey_completed' | 'no_show';
}

export const TransactionStatusBadge: React.FC<TransactionStatusBadgeProps> = ({ status }) => {
  const styles = {
    pending: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    approved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    rejected: 'bg-red-500/10 text-red-500 border-red-500/20',
    survey_confirmed: 'bg-blue-500/10 text-blue-400 border-blue-505/20',
    survey_completed: 'bg-sky-505/10 text-sky-400 border-sky-550/20',
    no_show: 'bg-rose-500/10 text-rose-500 border-rose-505/20'
  };

  const labels = {
    pending: 'Menunggu',
    approved: 'Disetujui',
    rejected: 'Ditolak',
    survey_confirmed: 'Janji Survey',
    survey_completed: 'Survey Selesai',
    no_show: 'No Show (DP Hangus)'
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[8px] font-extrabold uppercase font-mono tracking-wider border ${styles[status]}`}>
      {labels[status]}
    </span>
  );
};

export default TransactionStatusBadge;
