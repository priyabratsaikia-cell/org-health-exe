import { Bot } from 'lucide-react';

export default function AgentPulse({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const s = size === 'sm' ? 'w-5 h-5' : 'w-7 h-7';
  const iconS = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';
  return (
    <div className={`${s} rounded-lg accent-gradient flex items-center justify-center animate-glow-pulse flex-shrink-0`}>
      <Bot className={`${iconS} text-white`} />
    </div>
  );
}
