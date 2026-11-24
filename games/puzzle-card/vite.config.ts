import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [
    {
      name: 'xhs-defer-iife-script',
      enforce: 'post',
      transformIndexHtml(html) {
        return html
          .replace(/\s+crossorigin(?:="[^"]*")?/gi, '')
          .replace(
            /<script\s+type="module"\s+src="([^"]+)"><\/script>/gi,
            '<script defer src="$1"></script>'
          );
      },
    },
  ],
  build: {
    target: 'es2019',
    modulePreload: false,
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        format: 'iife',
        name: 'PuzzleCardApp',
        inlineDynamicImports: true,
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
