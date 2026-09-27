import { defineConfig, devices } from '@playwright/test';
import { createServer } from 'node:net';

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? await findFreePort());
process.env.PLAYWRIGHT_PORT = String(PORT);
const startCommand = 'node scripts/e2e-server.js';

// One process serves both halves, so the test server is the real server — not a
// stand-in. `npm test` builds the SPA first, then boots it against a throwaway DB.
export default defineConfig({
  testDir: 'tests',
  timeout: 30_000,
  fullyParallel: false,        // the tests mutate shared org state, so keep them ordered
  workers: 1,
  reporter: [['list']],

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: startCommand,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      PORT: String(PORT),
      HOST: '127.0.0.1',
      NODE_ENV: 'production',
      COOKIE_SECURE: 'false',
      JWT_SECRET: 'e2e-secret',
    },
  },
});

async function findFreePort() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

