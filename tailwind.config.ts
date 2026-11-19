import type { Config } from 'tailwindcss';
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Valores definidos uma unica vez em app/globals.css (:root).
      colors: {
        page: 'var(--color-page)',
        surface: 'var(--color-surface)',
        elevated: 'var(--color-elevated)',
        border: 'var(--color-border)',
        'border-strong': 'var(--color-border-strong)',
        input: 'var(--color-input)',
        foreground: 'var(--color-text)',
        muted: 'var(--color-text-secondary)',
        accent: {
          DEFAULT: 'var(--color-accent)',
          hover: 'var(--color-accent-hover)',
          soft: 'var(--color-accent-soft)',
          foreground: 'var(--color-on-accent)',
        },
        error: 'var(--color-error)',
      },
    },
  },
  plugins: [],
} satisfies Config;
