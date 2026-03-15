const styles: Record<string, string> = {
  quick: 'bg-emerald-500/12 text-emerald-400 border-emerald-500/20',
  medium: 'bg-yellow-500/12 text-yellow-400 border-yellow-500/20',
  large: 'bg-orange-500/12 text-orange-400 border-orange-500/20',
};

export default function EffortTag({ effort }: { effort: string }) {
  const key = effort.toLowerCase().includes('quick') ? 'quick' : effort.toLowerCase().includes('large') ? 'large' : 'medium';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${styles[key]}`}>
      {effort}
    </span>
  );
}
