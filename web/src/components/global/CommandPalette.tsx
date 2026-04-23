/* eslint-disable react/react-in-jsx-scope */
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Command, Gavel, Search, User, Users, X } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useGlobalUi } from '@/contexts/GlobalUiContext';

interface SearchItem {
  id: string;
  type: 'MEMBER' | 'TEAM' | 'POLICY';
  title: string;
  sub: string;
  path: string;
}

const SEARCH_ITEMS: SearchItem[] = [
  { id: 'members', type: 'MEMBER', title: 'Members Registry', sub: 'Personnel and onboarding operations', path: '/members' },
  { id: 'teams', type: 'TEAM', title: 'Tactical Units', sub: 'Team capacity and utilization', path: '/teams' },
  { id: 'policies', type: 'POLICY', title: 'Policy Manifest', sub: 'Governance and limits', path: '/policies' },
];

export function CommandPalette() {
  const navigate = useNavigate();
  const { isCommandPaletteOpen, closeCommandPalette } = useGlobalUi();
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    if (!query.trim()) return SEARCH_ITEMS;
    const lowered = query.toLowerCase();
    return SEARCH_ITEMS.filter(
      (item) => item.title.toLowerCase().includes(lowered) || item.sub.toLowerCase().includes(lowered),
    );
  }, [query]);

  const close = () => {
    closeCommandPalette();
    setQuery('');
  };

  return (
    <AnimatePresence>
      {isCommandPaletteOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-20 px-4">
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -14 }}
            className="relative w-full max-w-2xl glass-panel rounded-3xl border border-white/10 overflow-hidden"
          >
            <div className="flex items-center px-6 py-4 border-b border-white/5">
              <Search className="w-4 h-4 text-primary mr-3" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search subjects, units, protocols..."
                className="bg-transparent border-none focus:ring-0 text-sm font-bold w-full placeholder:text-on-surface-variant/40 uppercase tracking-tight"
              />
              <button type="button" onClick={close} className="p-2 rounded-lg hover:bg-white/5 text-on-surface-variant hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-[56vh] overflow-y-auto py-2">
              {results.length === 0 ? (
                <div className="px-6 py-12 text-center text-[10px] font-black uppercase tracking-[0.3em] text-on-surface-variant opacity-40">
                  No matching segments
                </div>
              ) : (
                results.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      navigate(item.path);
                      close();
                    }}
                    className="w-full px-6 py-4 text-left hover:bg-white/5 transition-all group flex items-center gap-3"
                  >
                    <span className="w-9 h-9 rounded-xl bg-surface border border-white/10 flex items-center justify-center">
                      {item.type === 'MEMBER' && <User className="w-4 h-4" />}
                      {item.type === 'TEAM' && <Users className="w-4 h-4" />}
                      {item.type === 'POLICY' && <Gavel className="w-4 h-4" />}
                    </span>
                    <span className="flex-1">
                      <p className="text-xs font-black uppercase tracking-tight">{item.title}</p>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant opacity-60">
                        {item.sub}
                      </p>
                    </span>
                  </button>
                ))
              )}
            </div>

            <div className="px-6 py-3 bg-white/5 border-t border-white/5 flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-on-surface-variant opacity-50">
                Cmd/Ctrl + K
              </span>
              <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-primary/70 flex items-center gap-2">
                <Command className="w-3 h-3" /> Archive Search
              </span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
