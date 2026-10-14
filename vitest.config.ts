import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    // Sourcemap-предупреждения от dist-файлов n8n-workflow — шум
    sourcemapIgnoreList: (sourcePath) => sourcePath.includes('node_modules'),
  },
});
