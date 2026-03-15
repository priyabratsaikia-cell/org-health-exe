const styles: Record<string, string> = {
  running: 'bg-accent/10 text-accent-light',
  completed: 'bg-emerald-500/10 text-emerald-400',
  failed: 'bg-red-500/10 text-red-400',
};

const dotStyles: Record<string, string> = {
  running: 'bg-accent-light animate-pulse',
  completed: 'bg-emerald-400',
  failed: 'bg-red-400',
};

export default function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${styles[status] || 'bg-gray-500/10 text-gray-400'}`}>
      <span className={`w-[5px] h-[5px] rounded-full ${dotStyles[status] || 'bg-gray-400'}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
