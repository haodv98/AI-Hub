import axios from 'axios';
import keycloak from './auth';

export interface ApiErrorPayload {
  code?: string;
  message?: string;
}

export interface ApiPaginationMeta {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface ApiMeta {
  timestamp?: string;
  pagination?: ApiPaginationMeta;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: ApiErrorPayload;
  meta?: ApiMeta;
}

export interface ApiClientError extends Error {
  status?: number;
  code?: string;
}

const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  if (keycloak.isTokenExpired(30)) {
    try {
      await keycloak.updateToken(30);
    } catch {
      keycloak.login();
      return Promise.reject(new Error('Session expired'));
    }
  }
  if (keycloak.token) {
    config.headers.Authorization = `Bearer ${keycloak.token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) keycloak.login();
    return Promise.reject(err);
  },
);

export function mapApiError(error: unknown, fallbackMessage = 'Request failed'): ApiClientError {
  const defaultError = new Error(fallbackMessage) as ApiClientError;
  if (!axios.isAxiosError(error)) return defaultError;

  const status = error.response?.status;
  const payload = error.response?.data as ApiEnvelope<unknown> | undefined;
  const mapped = new Error(payload?.error?.message || error.message || fallbackMessage) as ApiClientError;
  mapped.status = status;
  mapped.code = payload?.error?.code;
  return mapped;
}

function unwrapEnvelope<T>(envelope: ApiEnvelope<T>, fallbackMessage: string): { data: T; meta?: ApiMeta } {
  if (envelope.success && envelope.data !== undefined) {
    return { data: envelope.data, meta: envelope.meta };
  }
  const error = new Error(envelope.error?.message || fallbackMessage) as ApiClientError;
  error.code = envelope.error?.code;
  throw error;
}

export async function getEnvelope<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  let response;
  try {
    response = await api.get<ApiEnvelope<T>>(path, { params });
  } catch (error) {
    throw mapApiError(error, 'Failed to load data');
  }
  return unwrapEnvelope(response.data, 'Failed to load data').data;
}

export async function getPaginatedEnvelope<T>(
  path: string,
  params?: Record<string, unknown>,
): Promise<{ data: T; pagination?: ApiPaginationMeta }> {
  let response;
  try {
    response = await api.get<ApiEnvelope<T>>(path, { params });
  } catch (error) {
    throw mapApiError(error, 'Failed to load data');
  }
  const unwrapped = unwrapEnvelope(response.data, 'Failed to load data');
  return { data: unwrapped.data, pagination: unwrapped.meta?.pagination };
}

export async function postEnvelope<T, P = unknown>(path: string, payload?: P): Promise<T> {
  let response;
  try {
    response = await api.post<ApiEnvelope<T>>(path, payload);
  } catch (error) {
    throw mapApiError(error, 'Failed to submit data');
  }
  return unwrapEnvelope(response.data, 'Failed to submit data').data;
}

export async function putEnvelope<T, P = unknown>(path: string, payload?: P): Promise<T> {
  let response;
  try {
    response = await api.put<ApiEnvelope<T>>(path, payload);
  } catch (error) {
    throw mapApiError(error, 'Failed to update data');
  }
  return unwrapEnvelope(response.data, 'Failed to update data').data;
}

export async function deleteEnvelope<T>(path: string): Promise<T> {
  let response;
  try {
    response = await api.delete<ApiEnvelope<T>>(path);
  } catch (error) {
    throw mapApiError(error, 'Failed to delete data');
  }
  return unwrapEnvelope(response.data, 'Failed to delete data').data;
}

export default api;
