import { defineConfig } from 'vite';

export default defineConfig({
  // 상대 경로 기반: GitHub Pages(/city/) 등 어떤 하위 경로에서도 동작
  base: './',
  build: {
    // three.js 자체가 크므로 경고 한도만 완화
    chunkSizeWarningLimit: 900,
  },
});
