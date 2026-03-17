import type { CSSProperties, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
}

export default function GlassCard({ children, className = '', hover = false, onClick, style }: Props) {
  return (
    <div
      className={`${hover ? 'glass-card-hover cursor-pointer' : 'glass-card'} ${className}`}
      onClick={onClick}
      style={style}
    >
      {children}
    </div>
  );
}
