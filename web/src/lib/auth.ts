import Keycloak from 'keycloak-js';

const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL ?? 'http://localhost:8080',
  realm: import.meta.env.VITE_KEYCLOAK_REALM ?? 'aihub',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? 'aihub-admin-portal',
});

export default keycloak;

export function hasRole(role: string): boolean {
  return keycloak.hasRealmRole(role);
}

export function isAdmin(): boolean {
  return hasRole('it_admin') || hasRole('super_admin');
}

export function isTeamLead(): boolean {
  return hasRole('team_lead') || isAdmin();
}

export function getToken(): string | undefined {
  return keycloak.token;
}
