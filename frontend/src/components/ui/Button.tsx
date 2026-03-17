import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { useColors } from '@/context/AppContext';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'accent' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  loading?: boolean;
}

const variants = {
  accent: 'text-white',
  secondary: 'border',
  ghost: 'bg-transparent',
  danger: 'border',
};

const sizes = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-5 py-2.5 text-sm gap-2',
};

export default function Button({ variant = 'accent', size = 'md', icon, loading, children, className = '', disabled, ...rest }: Props) {
  const C = useColors();

  const variantStyles: Record<string, CSSProperties> = {
    accent: { background: C.blue60, color: '#FFFFFF' },
    secondary: { background: `${C.gray80}40`, color: C.gray30, borderColor: C.gray80 },
    ghost: { background: 'transparent', color: C.gray40 },
    danger: { background: `${C.supportError}15`, color: C.red40, borderColor: `${C.supportError}30` },
  };

  return (
    <button
      className={`inline-flex items-center justify-center font-semibold transition-all duration-150 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      style={variantStyles[variant]}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-current/20 border-t-current rounded-full animate-spin" />
      ) : icon ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}
