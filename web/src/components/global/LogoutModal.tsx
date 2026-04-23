/* eslint-disable react/react-in-jsx-scope */
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, LogOut, X } from 'lucide-react';
import keycloak from '@/lib/auth';
import { useGlobalUi } from '@/contexts/GlobalUiContext';

export function LogoutModal() {
  const { isLogoutModalOpen, closeLogoutModal } = useGlobalUi();

  return (
    <AnimatePresence>
      {isLogoutModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeLogoutModal}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            className="relative w-full max-w-md glass-panel p-8 rounded-3xl border border-error/20"
          >
            <div className="flex justify-between mb-6">
              <span className="w-14 h-14 rounded-2xl bg-error/10 border border-error/20 flex items-center justify-center">
                <AlertTriangle className="w-7 h-7 text-error" />
              </span>
              <button type="button" onClick={closeLogoutModal} className="p-2 rounded-xl hover:bg-white/5 text-on-surface-variant hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <h3 className="text-3xl font-black uppercase tracking-tight leading-none mb-3">
              Terminate <span className="text-error">Session?</span>
            </h3>
            <p className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant opacity-70 leading-relaxed">
              You are about to sever the secure link between this workstation and AIHub core. Active transmission channels will be invalidated.
            </p>

            <div className="mt-8 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => keycloak.logout()}
                className="w-full py-3 bg-error text-on-primary rounded-xl text-[10px] font-black uppercase tracking-[0.3em] flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" /> Terminate Link
              </button>
              <button
                type="button"
                onClick={closeLogoutModal}
                className="w-full py-3 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-[0.3em]"
              >
                Acknowledge & Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
