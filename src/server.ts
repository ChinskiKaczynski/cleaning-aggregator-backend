import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import config from './config/config';
import routes from './routes';
import databasePlugin from './plugins/database';
import { setupScraper } from './services/scraper';

// Logger
import pino from 'pino';
const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname',
    },
  },
});

export async function buildServer(): Promise<FastifyInstance> {
  const server = fastify({
    logger,
    ajv: {
      customOptions: {
        removeAdditional: 'all',
        coerceTypes: true,
        useDefaults: true,
      },
    },
  }).withTypeProvider<TypeBoxTypeProvider>();

  // Rejestracja pluginów
  await server.register(cors, config.cors);
  
  // Swagger/OpenAPI dokumentacja
  await server.register(swagger, {
    swagger: {
      info: {
        title: 'Agregator Firm Sprzątających API',
        description: 'API do wyszukiwania i zarządzania firmami sprzątającymi',
        version: '1.0.0',
      },
      host: `${config.server.host}:${config.server.port}`,
      schemes: ['http'],
      consumes: ['application/json'],
      produces: ['application/json'],
      tags: [
        { name: 'System', description: 'Endpointy systemowe' },
        { name: 'Companies', description: 'Operacje na firmach' },
        { name: 'Search', description: 'Wyszukiwanie firm' },
        { name: 'Admin', description: 'Operacje administracyjne' }
      ]
    }
  });

  // Swagger UI
  await server.register(swaggerUi, {
    routePrefix: '/documentation',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false
    },
    staticCSP: true
  });

  // Rejestracja pluginu bazy danych
  await server.register(databasePlugin);

  // Rejestracja scrapera
  await server.register(async (fastify) => {
    await setupScraper(fastify);
  });

  // Rejestracja routes
  await server.register(routes);

  // Podstawowy health check
  server.get('/health', {
    schema: {
      description: 'Health check endpoint',
      tags: ['System'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
          },
        },
      },
    },
  }, async () => ({
    status: 'OK',
    timestamp: new Date().toISOString(),
  }));

  // Obsługa błędów
  server.setErrorHandler((error, request, reply) => {
    logger.error(error);
    reply.status(error.statusCode ?? 500).send({
      error: error.name,
      message: error.message,
      statusCode: error.statusCode ?? 500,
    });
  });

  return server;
}

// Uruchomienie serwera tylko jeśli plik jest uruchamiany bezpośrednio
if (import.meta.url === process.argv[1]) {
  try {
    const server = await buildServer();
    await server.listen({
      port: config.server.port,
      host: config.server.host,
    });
    
    logger.info(`Server running at http://${config.server.host}:${config.server.port}`);
    logger.info(`Documentation available at http://${config.server.host}:${config.server.port}/documentation`);
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}