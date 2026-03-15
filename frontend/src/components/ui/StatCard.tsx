import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface Props {
  label: string;
  value: number | string;
  icon: ReactNode;
  color?: string;
  subtitle?: string;
  animate?: boolean;
}

export default function StatCard({ label, value, icon, color = '#F97316', subtitle, animate = true }: Props) {
  const [display, setDisplay] = useState(animate && typeof value === 'number' ? 0 : value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!animate || typeof value !== 'number') {
      setDisplay(value);
      return;
    }
    const target = value as number;
    const duration = 800;
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [value, animate]);

  return (
    <div ref={ref} className="glass-card p-4 relative overflow-hidden group">
      <div className="absolute top-0 left-0 w-full h-[3px]" style={{ background: `linear-gradient(90deg, ${color}, ${color}88)` }} />
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</span>
          <div className="text-2xl font-extrabold mt-1 tracking-tight" style={{ color }}>{display}</div>
          {subtitle && <span className="text-[11px] text-gray-500 mt-1 block">{subtitle}</span>}
        </div>
        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${color}15` }}>
          <span style={{ color }}>{icon}</span>
        </div>
      </div>
    </div>
  );
}
