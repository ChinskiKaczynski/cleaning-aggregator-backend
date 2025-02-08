import { afterAll, beforeAll, vi } from 'vitest';
import { build } from '../app';
import type { FastifyInstance } from 'fastify';
import { mockRedis, mockSupabase, mockCompanyWithDistance } from './mocks';
import type { MockInstance } from 'vitest';

let app: FastifyInstance | null = null;

beforeAll(async () => {
  try {
    // Ustaw zmienne środowiskowe dla testów
    process.env.NODE_ENV = 'test';
    process.env.SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SERVICE_KEY = 'test-key';
    process.env.REDIS_URL = 'redis://localhost:6379';

    // Zbuduj aplikację
    const fastifyApp = await build();
    app = fastifyApp;

    if (app) {
      // @ts-ignore - ignorujemy błędy TypeScript dla mocków w testach
      app.redis = mockRedis;
      // @ts-ignore
      app.supabase = mockSupabase;

      // Skonfiguruj zachowanie mocka Supabase dla testów lokalizacji
      const rpcMock = mockSupabase.rpc as unknown as MockInstance;
      rpcMock.mockImplementation((functionName: string, params: any) => {
        if (functionName === 'find_companies_in_radius') {
          // Testowa odpowiedź dla wyszukiwania w promieniu
          if (params.lat === -82.862752) { // Współrzędne dla Antarktydy
            return Promise.resolve({
              data: [],
              error: null,
              count: 0,
              status: 200,
              statusText: 'OK'
            });
          }

          // Standardowa odpowiedź z jedną firmą
          return Promise.resolve({
            data: [mockCompanyWithDistance],
            error: null,
            count: 1,
            status: 200,
            statusText: 'OK'
          });
        }

        // Domyślna odpowiedź dla innych wywołań RPC
        return Promise.resolve({
          data: null,
          error: null,
          count: 0,
          status: 200,
          statusText: 'OK'
        });
      });
    }
  } catch (error) {
    console.error('Error during test setup:', error);
    throw error;
  }
});

afterAll(async () => {
  try {
    vi.clearAllMocks();
    if (app) {
      await app.close();
    }
  } catch (error) {
    console.error('Cleanup error:', error);
  } finally {
    app = null;
  }
});
