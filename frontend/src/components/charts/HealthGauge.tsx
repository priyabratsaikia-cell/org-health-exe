import { useEffect, useRef, useState } from 'react';
import { scoreColor, scoreGrade } from '@/utils/scoreHelpers';
import { useApp } from '@/context/AppContext';

interface Props {
  score: number | null;
  size?: 'sm' | 'lg';
}

export default function HealthGauge({ score, size = 'lg' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [animatedScore, setAnimatedScore] = useState(0);
  const { state } = useApp();
  const isLight = state.resolvedTheme === 'light';

  useEffect(() => {
    if (score === null || score === undefined) return;
    const target = score;
    const duration = 1200;
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      setAnimatedScore(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [score]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h - (size === 'lg' ? 16 : 8);
    const radius = size === 'lg' ? 90 : 55;
    const lineWidth = size === 'lg' ? 18 : 12;

    ctx.beginPath();
    ctx.arc(cx, cy, radius, Math.PI, 2 * Math.PI);
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.06)';
    ctx.lineCap = 'round';
    ctx.stroke();

    if (animatedScore > 0) {
      const pct = Math.min(animatedScore, 100) / 100;
      const angle = Math.PI + pct * Math.PI;
      const color = scoreColor(animatedScore);

      const gradient = ctx.createLinearGradient(cx - radius, cy, cx + radius, cy);
      gradient.addColorStop(0, color + 'CC');
      gradient.addColorStop(1, color);

      ctx.beginPath();
      ctx.arc(cx, cy, radius, Math.PI, angle);
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = gradient;
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.shadowColor = color;
      ctx.shadowBlur = isLight ? 8 : 15;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, Math.PI, angle);
      ctx.lineWidth = lineWidth / 3;
      ctx.strokeStyle = color + '40';
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }, [animatedScore, size, isLight]);

  const color = score !== null ? scoreColor(score) : '#6B7280';
  const grade = score !== null ? scoreGrade(score) : '--';
  const isLg = size === 'lg';
  const subColor = isLight ? '#6F6F6F' : '#8D8D8D';

  return (
    <div className="relative flex flex-col items-center">
      <canvas
        ref={canvasRef}
        style={{ width: isLg ? 220 : 120, height: isLg ? 130 : 75 }}
      />
      <div className="absolute flex flex-col items-center" style={{ bottom: isLg ? 18 : 8 }}>
        <span className={`font-black tracking-tighter ${isLg ? 'text-4xl' : 'text-xl'}`} style={{ color }}>
          {score !== null ? animatedScore : '--'}
        </span>
        <span className={`font-semibold ${isLg ? 'text-xs' : 'text-[9px]'}`} style={{ color: subColor }}>{grade}</span>
      </div>
    </div>
  );
}
