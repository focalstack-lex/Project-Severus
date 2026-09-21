import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        olivePrimary: '#4A6741',
        oliveDark: '#385031',
        creamBackground: '#FDFBF7',
        creamCard: '#F7F4EC',
        charcoalText: '#1E293B',
        amberAccent: '#D97706',
        forestTeal: '#1F5F5B',
      },
      borderRadius: {
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
};
export default config;
