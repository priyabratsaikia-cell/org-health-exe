import type { ReactNode } from 'react';
import { useColors } from '@/context/AppContext';

interface Props {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({ icon, title, description, action }: Props) {
  const C = useColors();
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {icon && <div className="mb-4" style={{ color: C.gray60 }}>{icon}</div>}
      <h3 className="text-lg font-semibold mb-1" style={{ color: C.gray40 }}>{title}</h3>
      {description && <p className="text-sm max-w-md mb-4" style={{ color: C.gray50 }}>{description}</p>}
      {action}
    </div>
  );
}
