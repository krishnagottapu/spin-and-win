import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      animation: {
        ticker: 'ticker 20s linear infinite',
        'spin-slow': 'spin 3s linear infinite',
        timesup: 'timesup 0.4s ease-out forwards',
      },
      keyframes: {
        ticker: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        timesup: {
          '0%': { opacity: '0', transform: 'scale(0.6)' },
          '20%': { opacity: '1', transform: 'scale(1.05)' },
          '35%': { transform: 'scale(1.0)' },
          '100%': { opacity: '1', transform: 'scale(1.0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
