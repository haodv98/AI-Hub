export const THEME = {
  colors: {
    surface: '#020617',
    onSurface: '#f8fafc',
    onSurfaceVariant: '#94a3b8',
    primary: '#38bdf8',
    primaryDim: '#0ea5e9',
    secondary: '#64748b',
    tertiary: '#10b981',
    error: '#ef4444',
    outline: 'rgba(255, 255, 255, 0.1)',
  },
  spacing: {
    sidebar: '16rem', // 64 in tailwind
  }
};

export const BREAKPOINTS = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
};

/** @deprecated Prefer POLICY_MODEL_IDS / POLICY_MODEL_IDS_FLAT from ./model-ids — values must match gateway/LiteLLM model ids. */
export const ENGINES = [
  'gpt-4o',
  'gpt-4o-mini',
  'o4-mini',
  'claude-sonnet-4-20250514',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
  'claude-3-haiku-20240307',
  'gemini-2.0-flash',
  'gemini-2.5-flash-preview-05-20',
  'gemini-2.5-pro-preview-05-06',
] as const;
