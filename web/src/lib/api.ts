import axios from 'axios';
import keycloak from './auth';

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

export default api;
