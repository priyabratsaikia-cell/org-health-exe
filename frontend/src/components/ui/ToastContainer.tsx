import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { getColors } from '@/utils/colors';

const icons = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
};

export default function ToastContainer() {
  const { state, dispatch } = useApp();
  const C = getColors(state.accentColor);

  const borderColors = {
    success: C.supportSuccess,
    error: C.supportError,
    info: C.blue60,
  };

  const iconColors = {
    success: C.supportSuccess,
    error: C.supportError,
    info: C.blue40,
  };

  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2">
      <AnimatePresence>
        {state.toasts.map(t => {
          const Icon = icons[t.type];
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              style={{
                background: C.gray90,
                border: `1px solid ${C.gray80}`,
                borderLeftWidth: 3,
                borderLeftColor: borderColors[t.type],
              }}
              className="px-4 py-3 flex items-center gap-2.5 max-w-sm text-sm shadow-lg"
            >
              <Icon className="w-4 h-4 flex-shrink-0" style={{ color: iconColors[t.type] }} />
              <span className="flex-1" style={{ color: C.gray20 }}>{t.message}</span>
              <button
                onClick={() => dispatch({ type: 'REMOVE_TOAST', payload: t.id })}
                className="flex-shrink-0 p-0.5 transition-colors"
                style={{ color: C.gray60 }}
                onMouseEnter={e => (e.currentTarget.style.color = C.gray20)}
                onMouseLeave={e => (e.currentTarget.style.color = C.gray60)}
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
