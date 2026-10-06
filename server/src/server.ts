import { Server } from 'node:http';
import { app } from './app';
import { env } from './config/env';
import { connectDatabase } from './db';

let server: Server | undefined;

async function start(): Promise<void> {
  await connectDatabase();
  server = app.listen(env.PORT, () => console.log(`Smart Healthcare API listening on port ${env.PORT}`));
  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${env.PORT} is already in use. Set PORT to an available port and retry.`);
      process.exit(1);
    }
    console.error('API server failed to start:', error);
    process.exitCode = 1;
  });
}

function shutdown(signal: string): void {
  console.log(`${signal} received; shutting down`);
  server?.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start().catch((error) => {
  console.error('Unable to start API:', error);
  process.exitCode = 1;
});