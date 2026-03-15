import { scoreColor, scoreClass } from '@/utils/scoreHelpers';

interface Props {
  score: number;
  size?: 'sm' | 'md';
}

const bgMap: Record<string, string> = {
  excellent: 'bg-emerald-500/15 text-emerald-400',
  good: 'bg-green-500/15 text-green-400',
  fair: 'bg-yellow-500/15 text-yellow-400',
  poor: 'bg-orange-500/15 text-orange-400',
  critical: 'bg-red-500/15 text-red-400',
};

export default function ScoreBadge({ score, size = 'sm' }: Props) {
  const cls = scoreClass(score);
  const sizeClass = size === 'md' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs';
  return (
    <span className={`inline-flex items-center justify-center rounded-md font-extrabold ${bgMap[cls]} ${sizeClass}`}>
      {score}
    </span>
  );
}
