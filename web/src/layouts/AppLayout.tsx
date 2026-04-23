import { Outlet, useLocation } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { Sidebar } from '@/components/organisms/Sidebar';
import { TopBar } from '@/components/organisms/TopBar';
import { Glow } from '@/components/atoms/Glow';

export default function AppLayout() {
  const location = useLocation();

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
    </div>
  );
}
