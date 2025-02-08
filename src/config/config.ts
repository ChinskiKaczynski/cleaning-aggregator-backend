interface Config {
  nodeEnv: string;
  logLevel: string;
  server: {
    port: number;
    host: string;
  };
  cors: {
    origin: string[];
    credentials: boolean;
  };
  supabase: {
    url: string;
    key: string;
  };
  redis: {
    url: string;
  };
  proxy: {
    enabled: boolean;
    list: string;
    retryAttempts: number;
    timeoutMs: number;
  };
}

const config: Config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  server: {
    port: Number(process.env.PORT) || 3000,
    host: process.env.HOST || '0.0.0.0',
  },
  cors: {
    origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(','),
    credentials: true,
  },
  supabase: {
    url: process.env.SUPABASE_URL || '',
    key: process.env.SUPABASE_KEY || '',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  proxy: {
    enabled: process.env.PROXY_ENABLED === 'true',
    list: process.env.PROXY_LIST || '[]',
    retryAttempts: Number(process.env.PROXY_RETRY_ATTEMPTS) || 3,
    timeoutMs: Number(process.env.PROXY_TIMEOUT_MS) || 10000,
  }
};

// Walidacja wymaganych zmiennych środowiskowych
const requiredEnvs = ['SUPABASE_URL', 'SUPABASE_KEY'];
const missingEnvs = requiredEnvs.filter(env => !process.env[env]);

if (missingEnvs.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnvs.join(', ')}`);
}

export default config;