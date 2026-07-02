import { defineConfig } from 'vite';

// Dev: serves index.html at the project root (the playground).
// Build: library mode -> dist/, with html2pdf.js kept external (it's an optional peer dep).
export default defineConfig(({ command }) => {
  if (command === 'build') {
    return {
      build: {
        sourcemap: true,
        lib: {
          entry: 'src/index.js',
          name: 'TableExportPdf',
          formats: ['es', 'umd'],
          fileName: (format) => `table-export-pdf.${format}.js`,
        },
        rollupOptions: {
          external: ['html2pdf.js'],
          output: { globals: { 'html2pdf.js': 'html2pdf' } },
        },
      },
    };
  }
  return {}; // dev server: default root, serves ./index.html
});
