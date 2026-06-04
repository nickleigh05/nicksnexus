// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://nickleigh.github.io',
  base: '/nicksnexus',
  output: 'static',
  vite: {
    plugins: [tailwindcss()]
  }
});