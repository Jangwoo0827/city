import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 상대 경로 기반: GitHub Pages(/city/) 등 어떤 하위 경로에서도 동작
  base: './',
  build: {
    // three.js 자체가 크므로 경고 한도만 완화
    chunkSizeWarningLimit: 900,
  },
  test: {
    // 수백 틱을 돌리는 시뮬레이션 테스트가 있어 넉넉하게
    testTimeout: 60000,
  },
});
