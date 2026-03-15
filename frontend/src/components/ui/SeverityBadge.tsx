import { severityColor, severityBg } from '@/utils/scoreHelpers';

export default function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wide"
      style={{ color: severityColor(severity), backgroundColor: severityBg(severity) }}
    >
      {severity}
    </span>
  );
}
