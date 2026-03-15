import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';
import { useApp } from '@/context/AppContext';

const icons = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
};

const colors = {
  success: 'border-emerald-500/40 text-emerald-400',
  error: 'border-red-500/40 text-red-400',
  info: 'border-blue-500/40 text-blue-400',
};

export default function ToastContainer() {
  const { state, dispatch } = useApp();

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
              className={`glass-card px-4 py-3 border-l-2 ${colors[t.type]} flex items-center gap-2.5 max-w-sm text-sm`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="text-gray-300 flex-1">{t.message}</span>
              <button
                onClick={() => dispatch({ type: 'REMOVE_TOAST', payload: t.id })}
                className="flex-shrink-0 p-0.5 rounded hover:bg-white/[0.08] transition-colors text-gray-500 hover:text-gray-300"
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
