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

export const ENGINES = [
  'GPT-4o',
  'GPT-4-Turbo',
  'GPT-3.5-Turbo',
  'Claude-3.5-Sonnet',
  'Claude-3.5-Opus',
  'Llama-3-70b',
  'Llama-3-8b',
  'o1-preview',
] as const;
