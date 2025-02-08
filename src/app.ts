import Fastify, { FastifyInstance } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import routes from './routes';
import databasePlugin from './plugins/database';
import { type SupabaseClient } from '@supabase/supabase-js';
import { type RedisClientType } from 'redis';
import config from './config/config';

declare module 'fastify' {
  interface FastifyInstance {
    supabase: SupabaseClient;
    redis: RedisClientType;
  }
}

export async function build(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
  }).withTypeProvider<TypeBoxTypeProvider>();

  // Rejestracja pluginów
  await app.register(databasePlugin);

  // Rejestracja routingu
  await app.register(routes);

  return app;
}

export default build;