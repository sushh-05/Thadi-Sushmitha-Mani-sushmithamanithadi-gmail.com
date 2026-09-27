// Start the Playwright server with a process-specific SQLite file.
// Windows keeps SQLite files locked while an orphaned Node child is alive; a
// unique file prevents one interrupted run from blocking the next run.
process.env.DATABASE_FILE = `e2e-${process.pid}.db`;
const { execFileSync } = await import('node:child_process');
const port = Number(process.env.PORT ?? 8124);
try {
  if (process.platform === 'win32') {
    const lines = execFileSync('netstat', ['-ano'], { encoding: 'utf8' }).split(/\r?\n/);
    for (const line of lines) {
      if (!line.includes(`:${port} `)) continue;
      const pid = Number(line.trim().split(/\s+/).pop());
      if (pid && pid !== process.pid) { try { process.kill(pid); } catch {} }
    }
  } else {
    try { execFileSync('sh', ['-c', `lsof -ti tcp:${port} | xargs -r kill`]); } catch {}
  }
} catch {}
const { build } = await import('vite');
const { default: react } = await import('@vitejs/plugin-react');
const { fileURLToPath } = await import('node:url');
await build({
  root: fileURLToPath(new URL('../web/', import.meta.url)),
  plugins: [react()],
  build: { outDir: fileURLToPath(new URL('../dist/', import.meta.url)), emptyOutDir: true },
});
await import('./load-db.js');
await import('../server/index.js');
