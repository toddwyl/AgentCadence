import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/client/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
        display: ['"Space Grotesk"', '"Plus Jakarta Sans"', 'sans-serif'],
      },
      colors: {
        surface: {
          0: '#0a0a0f',
          1: '#12121a',
          2: '#1a1a26',
          3: '#222233',
          4: '#2a2a3d',
        },
        accent: {
          primary: '#6366f1',
          secondary: '#8b5cf6',
          glow: '#818cf8',
        },
        status: {
          pending: '#64748b',
          running: '#f59e0b',
          completed: '#10b981',
          failed: '#ef4444',
          skipped: '#6b7280',
          cancelled: '#9ca3af',
        },
        tool: {
          codex: '#22c55e',
          claude: '#f97316',
          cursor: '#3b82f6',
          custom: '#a855f7',
        },
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'slide-in': 'slide-in 0.3s ease-out',
        'fade-in': 'fade-in 0.2s ease-out',
        'spin-slow': 'spin 3s linear infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '1' },
        },
        'slide-in': {
          from: { transform: 'translateX(-8px)', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
