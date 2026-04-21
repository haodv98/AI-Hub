export interface AuthUser {
  id: string;
  email: string;
  apiKeyId?: string;
  teamId?: string | null;
  tier?: string;
  roles: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
