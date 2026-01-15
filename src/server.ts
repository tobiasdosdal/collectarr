import 'dotenv/config';
import Fastify from 'fastify';
import { buildApp } from './app.js';
import config from './config/index.js';

const fastify = Fastify({
  logger: {
    level: config.server.env === 'development' ? 'info' : 'warn',
    transport: config.server.env === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
});

async function start(): Promise<void> {
  try {
    await buildApp(fastify);

    await fastify.listen({
      port: config.server.port,
      host: config.server.host,
    });

    console.log(`Server running at http://${config.server.host}:${config.server.port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
signals.forEach((signal) => {
  process.on(signal, async () => {
    console.log(`\nReceived ${signal}, shutting down gracefully...`);
    await fastify.close();
    process.exit(0);
  });
});

start();
