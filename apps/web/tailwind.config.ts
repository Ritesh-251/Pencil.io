import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: 'var(--brand)',
        accent: 'var(--accent)',
        surface: 'var(--bg-surface)',
        'surface-strong': 'var(--bg-surface-strong)',
      },
    },
  },
  plugins: [],
};

export default config;
