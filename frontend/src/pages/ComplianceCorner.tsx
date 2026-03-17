import { Shield, ArrowRight } from 'lucide-react';
import PageTransition from '@/components/layout/PageTransition';
import { useApp } from '@/context/AppContext';
import { getColors } from '@/utils/colors';

export default function ComplianceCorner() {
  const { state } = useApp();
  const C = getColors(state.accentColor, state.resolvedTheme);
  return (
    <PageTransition>
      <div className="-m-6 flex flex-col items-center justify-center" style={{ minHeight: 'calc(100vh - 72px)', background: C.gray100 }}>
        <div className="max-w-lg text-center px-6">
          <div
            className="w-16 h-16 flex items-center justify-center mx-auto mb-6"
            style={{ background: `${C.orange40}15`, border: `1px solid ${C.orange40}40` }}
          >
            <Shield className="w-8 h-8" style={{ color: C.orange40 }} />
          </div>
          <h2
            className="text-[24px] font-semibold mb-3"
            style={{ color: C.gray10, fontFamily: '"IBM Plex Sans", sans-serif' }}
          >
            Compliance Corner
          </h2>
          <p className="text-[15px] leading-relaxed mb-2" style={{ color: C.gray30 }}>
            Here you will find your Salesforce orgs' compliance readiness scores,
            security posture assessments, and regulatory alignment insights.
          </p>
          <p className="text-[14px] mb-8" style={{ color: C.gray50 }}>
            We are actively working on this feature. Stay tuned for compliance dashboards,
            audit-ready reports, and automated readiness tracking.
          </p>
          <a
            href="https://www.pwc.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 text-[14px] font-normal transition-colors"
            style={{ background: C.blue60, color: C.white }}
            onMouseEnter={e => (e.currentTarget.style.background = C.blue60h)}
            onMouseLeave={e => (e.currentTarget.style.background = C.blue60)}
          >
            Learn more
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    </PageTransition>
  );
}
