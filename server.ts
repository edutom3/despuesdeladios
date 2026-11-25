import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import type { Request, Response } from 'express';
import { createApiApp } from './server/createApp.ts';
import { startAutomatedReminderScheduler } from './server/remindersService.ts';

const PORT = Number(process.env.PORT || 3000);

async function startServer() {
  const app = createApiApp();

  // --- Vite middleware (dev) or static dist/ (prod) ---
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Después del adiós activo en http://0.0.0.0:${PORT}`);
    startAutomatedReminderScheduler();
  });
}

startServer().catch((err) => {
  console.error('Error al iniciar el servidor:', err);
  process.exit(1);
});
