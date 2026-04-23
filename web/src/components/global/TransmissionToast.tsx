/* eslint-disable react/react-in-jsx-scope */
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2 } from 'lucide-react';
import { useGlobalUi } from '@/contexts/GlobalUiContext';

export function TransmissionToast() {
  const { toasts, dismissToast } = useGlobalUi();

  return (
    <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[120] flex flex-col gap-3">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.button
            key={toast.id}
            type="button"
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.96 }}
            onClick={() => dismissToast(toast.id)}
            className="px-6 py-4 bg-primary text-on-primary rounded-2xl shadow-[0_0_24px_rgba(56,189,248,0.4)] border border-white/20 text-left min-w-[320px]"
          >
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-4 h-4" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em]">{toast.title}</p>
                <p className="text-[11px] font-bold uppercase tracking-widest opacity-80">{toast.message}</p>
              </div>
            </div>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
