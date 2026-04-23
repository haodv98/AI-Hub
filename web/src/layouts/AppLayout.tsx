import { Outlet, useLocation } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { Sidebar } from '@/components/organisms/Sidebar';
import { TopBar } from '@/components/organisms/TopBar';
import { Glow } from '@/components/atoms/Glow';
import { CommandPalette } from '@/components/global/CommandPalette';
import { LogoutModal } from '@/components/global/LogoutModal';
import { TransmissionToast } from '@/components/global/TransmissionToast';
import { useGlobalUi } from '@/contexts/GlobalUiContext';
import { useEffect } from 'react';

export default function AppLayout() {
  const location = useLocation();
  const { openCommandPalette } = useGlobalUi();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        openCommandPalette();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openCommandPalette]);

  return (
    <div className="min-h-screen bg-surface selection:bg-primary/30 relative overflow-hidden flex">
      {/* Background Glows */}
      <Glow className="top-[-100px] left-[-100px]" />
      <Glow className="bottom-[-100px] right-[-100px]" opacity="opacity-50" />
      
      <Sidebar />
      
      <main className="md:ml-64 min-h-screen flex flex-col relative z-10 w-full">
        <TopBar />
        
        <div className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
      <CommandPalette />
      <LogoutModal />
      <TransmissionToast />
    </div>
  );
}
