import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  onClick,
  hoverable = false
}) => {
  const baseStyle = 'bg-slate-900 border border-slate-800 rounded-3xl shadow-xl overflow-hidden p-5';
  const interactiveStyle = onClick || hoverable ? 'transition-all duration-250 cursor-pointer hover:border-slate-700 hover:bg-slate-850/60 hover:-translate-y-0.5' : '';

  return (
    <div 
      className={`${baseStyle} ${interactiveStyle} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
};

export default Card;
