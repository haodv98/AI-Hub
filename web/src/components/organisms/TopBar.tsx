import { Grid2X2, Search } from 'lucide-react';
import { NavLink, useLocation } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import { useGlobalUi } from '@/contexts/GlobalUiContext';

export const TopBar = () => {
  const { userName } = useAuth();
  const location = useLocation();
  const { openCommandPalette, openLogoutModal } = useGlobalUi();

  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <header className="glass-panel text-on-surface h-20 px-8 flex justify-between items-center sticky top-0 z-30 m-4 rounded-2xl">
      <div className="flex items-center space-x-8">
        <button className="text-on-surface-variant hover:text-primary p-2 rounded-xl transition-all duration-200 hover:bg-white/5">
          <Grid2X2 className="w-5 h-5" />
        </button>
        
        <button
          type="button"
          onClick={openCommandPalette}
          className="hidden lg:flex items-center bg-white/5 px-4 py-2 rounded-xl border border-white/5 focus-within:border-primary/30 focus-within:bg-white/10 transition-all w-[320px] text-left"
        >
          <Search className="text-on-surface-variant w-4 h-4 mr-3" />
          <span className="text-sm font-medium text-on-surface-variant flex-1">Search systems...</span>
          <span className="text-[9px] text-primary font-black tracking-widest">CMD+K</span>
        </button>

        <nav className="hidden xl:flex space-x-6 text-[11px] font-bold uppercase tracking-widest">
          <NavLink 
            to="/dashboard"
            className={() => isActive('/dashboard') ? 'text-primary border-b-2 border-primary pb-1' : 'text-on-surface-variant hover:text-on-surface'}
          >
            Dashboard
          </NavLink>
          <NavLink 
            to="/teams"
            className={() => isActive('/teams') ? 'text-primary border-b-2 border-primary pb-1' : 'text-on-surface-variant hover:text-on-surface'}
          >
            Teams
          </NavLink>
          <NavLink 
             to="/members"
             className={() => isActive('/members') ? 'text-primary border-b-2 border-primary pb-1' : 'text-on-surface-variant hover:text-on-surface'}
          >
            Fleet
          </NavLink>
        </nav>
      </div>

      <div className="flex items-center space-x-4">
        <button 
          onClick={openLogoutModal}
          className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant hover:text-on-surface transition-colors"
        >
          SIGNOUT
        </button>
        <button className="bg-primary hover:bg-primary-dim text-on-primary px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all active:scale-95 status-glow">
          GEN_KEY
        </button>
        <div className="flex items-center space-x-3 ml-4">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] font-bold text-on-surface uppercase tracking-tight">{userName ?? 'USER_NULL'}</p>
            <p className="text-[9px] text-primary font-mono">OP: 042</p>
          </div>
          <div className="h-10 w-10 rounded-xl overflow-hidden border border-white/10 shadow-inner">
            <img 
              referrerPolicy="no-referrer"
              src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${userName ?? 'admin'}`} 
              alt="User Profile" 
              className="w-full h-full object-cover bg-white/5"
            />
          </div>
        </div>
      </div>
    </header>
  );
};
