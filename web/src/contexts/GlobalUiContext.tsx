import { createContext, useCallback, useContext, useMemo, useState } from 'react';

interface ToastItem {
  id: number;
  title: string;
  message: string;
}

interface GlobalUiContextValue {
  isCommandPaletteOpen: boolean;
  isLogoutModalOpen: boolean;
  toasts: ToastItem[];
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  openLogoutModal: () => void;
  closeLogoutModal: () => void;
  pushToast: (title: string, message: string) => void;
  dismissToast: (id: number) => void;
}

const GlobalUiContext = createContext<GlobalUiContextValue | null>(null);

export function GlobalUiProvider({ children }: { children: React.ReactNode }) {
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const openCommandPalette = useCallback(() => setIsCommandPaletteOpen(true), []);
  const closeCommandPalette = useCallback(() => setIsCommandPaletteOpen(false), []);
  const openLogoutModal = useCallback(() => setIsLogoutModalOpen(true), []);
  const closeLogoutModal = useCallback(() => setIsLogoutModalOpen(false), []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const pushToast = useCallback(
    (title: string, message: string) => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      setToasts((prev) => [...prev, { id, title, message }]);
      window.setTimeout(() => dismissToast(id), 3200);
    },
    [dismissToast],
  );

  const value = useMemo<GlobalUiContextValue>(
    () => ({
      isCommandPaletteOpen,
      isLogoutModalOpen,
      toasts,
      openCommandPalette,
      closeCommandPalette,
      openLogoutModal,
      closeLogoutModal,
      pushToast,
      dismissToast,
    }),
    [closeCommandPalette, closeLogoutModal, dismissToast, isCommandPaletteOpen, isLogoutModalOpen, openCommandPalette, openLogoutModal, pushToast, toasts],
  );

  return <GlobalUiContext.Provider value={value}>{children}</GlobalUiContext.Provider>;
}

export function useGlobalUi() {
  const context = useContext(GlobalUiContext);
  if (!context) throw new Error('useGlobalUi must be used within GlobalUiProvider');
  return context;
}
