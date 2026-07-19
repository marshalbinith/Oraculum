import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0a0e1a',
        surface: '#121829',
        'surface-2': '#1a2236',
        border: '#243049',
        primary: '#6366f1',
        'primary-hover': '#4f46e5',
        yes: '#22c55e',
        no: '#ef4444',
        muted: '#8b97b3',
      },
      borderRadius: { xl: '0.9rem' },
    },
  },
  plugins: [],
};

export default config;
