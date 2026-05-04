export interface AuthUser {
  id: string;
  email: string;
  apiKeyId?: string;
  teamId?: string | null;
  tier?: string;
  roles: string[];
  /** When set on the API key, gateway uses this LiteLLM model id instead of the client `model`. */
  defaultUpstreamModel?: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
