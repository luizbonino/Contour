/// <reference types="vitest" />
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Site code for the hosted app's cookieless counter (the <code> part of
// <code>.goatcounter.com). Set ONLY by the GitHub Pages workflow, so the
// committed dist/ build and the single-file release asset stay tracker-free.
const goatcounterCode = process.env.CONTOUR_GOATCOUNTER?.trim();

// Injects the GoatCounter snippet into index.html when that code is present.
// The script is an external https URL, so viteSingleFile leaves it alone
// instead of trying to inline it.
function goatcounter() {
  return {
    name: 'contour-goatcounter',
    transformIndexHtml() {
      if (!goatcounterCode) return [];
      return [
        {
          tag: 'script',
          attrs: {
            'data-goatcounter': `https://${goatcounterCode}.goatcounter.com/count`,
            async: true,
            src: 'https://gc.zgo.at/count.js',
          },
          injectTo: 'head' as const,
        },
      ];
    },
  };
}

export default defineConfig({
  plugins: [vue(), goatcounter(), viteSingleFile()],
  server: {
    port: 5173,
    open: true,
  },
  build: {
    // Inline everything — no threshold, no separate chunk files
    assetsInlineLimit: Infinity,
    cssCodeSplit: false,
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});
