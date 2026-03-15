import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export default function GlassCard({ children, className = '', hover = false, onClick }: Props) {
  return (
    <div
      className={`${hover ? 'glass-card-hover cursor-pointer' : 'glass-card'} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
