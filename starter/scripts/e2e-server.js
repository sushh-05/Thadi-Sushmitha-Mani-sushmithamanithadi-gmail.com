// Start the Playwright server with a process-specific SQLite file.
// Windows keeps SQLite files locked while an orphaned Node child is alive; a
// unique file prevents one interrupted run from blocking the next run.
process.env.DATABASE_FILE = `e2e-${process.pid}.db`;
await import('./load-db.js');
await import('../server/index.js');
