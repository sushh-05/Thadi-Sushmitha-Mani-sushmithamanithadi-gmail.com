import { defineConfig, devices } from '@playwright/test';
import { execFileSync } from 'node:child_process';

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 8124);
releasePort(PORT);
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
      JWT_SECRET: 'e2e-secret',
    },
  },
});

function releasePort(port) {
  if (process.platform !== 'win32') return;
  try {
    const lines = execFileSync('netstat', ['-ano'], { encoding: 'utf8' }).split(/\r?\n/);
    for (const line of lines) {
      if (!line.includes(`:${port} `)) continue;
      const pid = Number(line.trim().split(/\s+/).pop());
      if (pid && pid !== process.pid) { try { process.kill(pid); } catch {} }
    }
  } catch {}
}

