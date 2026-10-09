import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // three.js 자체가 크므로 경고 한도만 완화
    chunkSizeWarningLimit: 900,
  },
});
