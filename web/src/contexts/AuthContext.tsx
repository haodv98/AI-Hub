import React, { createContext, useContext, useEffect, useState } from 'react';
import keycloak, { hasRole } from '@/lib/auth';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  userEmail: string | null;
  userName: string | null;
  isAdmin: boolean;
  isTeamLead: boolean;
}

const AuthContext = createContext<AuthState>({
  isAuthenticated: false,
  isLoading: true,
  userEmail: null,
  userName: null,
  isAdmin: false,
  isTeamLead: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    userEmail: null,
    userName: null,
    isAdmin: false,
    isTeamLead: false,
  });

  useEffect(() => {
    keycloak
      .init({
        onLoad: 'login-required',
        pkceMethod: 'S256',
        checkLoginIframe: false,
      })
      .then((authenticated) => {
        setState({
          isAuthenticated: authenticated,
          isLoading: false,
          userEmail: keycloak.tokenParsed?.email ?? null,
          userName: keycloak.tokenParsed?.name ?? null,
          isAdmin: hasRole('it_admin') || hasRole('super_admin'),
          isTeamLead: hasRole('team_lead') || hasRole('it_admin') || hasRole('super_admin'),
        });

        // Auto-refresh token 30s before expiry
        setInterval(() => {
          keycloak.updateToken(30).catch(() => keycloak.login());
        }, 60_000);
      })
      .catch(() => {
        setState((s) => ({ ...s, isLoading: false }));
      });
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
