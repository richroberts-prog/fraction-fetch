import { defineConfig, devices } from '@playwright/test';

// Runs against the production build, as players get it.
export default defineConfig({
  testDir: 'e2e',
  timeout: 300_000,
  // Headless Chrome draws WebGL in software; several boards at once starve each other.
  workers: 1,
  use: { baseURL: 'http://localhost:4174/' },
  webServer: { command: 'npx vite preview --port 4174 --strictPort', url: 'http://localhost:4174/', reuseExistingServer: false },
  projects: [
    { name: 'tablet', use: { ...devices['iPad (gen 7)'], browserName: 'chromium' } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    { name: 'laptop', use: { viewport: { width: 1366, height: 768 } } },
    // Fire HD 8 on its side in Silk: the case where the board used to shrink to 39px tiles.
    { name: 'fire-sideways', use: { viewport: { width: 960, height: 544 }, deviceScaleFactor: 1.333, hasTouch: true, isMobile: true } },
  ],
});
