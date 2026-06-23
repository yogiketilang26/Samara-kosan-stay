import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'outline' | 'amber';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-semibold rounded-2xl transition-all duration-250 cursor-pointer focus:outline-none';
  
  const variants = {
    primary: 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg active:scale-95',
    secondary: 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700',
    danger: 'bg-red-650 hover:bg-red-550 text-white shadow-red-500/10 shadow-lg active:scale-95',
    success: 'bg-emerald-600 hover:bg-emerald-550 text-white shadow-lg active:scale-95',
    amber: 'bg-[#f5a623] hover:bg-[#e09312] text-black shadow-lg shadow-[#f5a623]/5 active:scale-95',
    outline: 'border border-slate-700 hover:bg-slate-800 text-slate-300'
  };

  const sizes = {
    sm: 'text-xs px-3 py-1.5',
    md: 'text-xs px-4 py-2',
    lg: 'text-sm px-6 py-3'
  };

  const width = fullWidth ? 'w-full' : '';

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${width} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
