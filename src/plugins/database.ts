import type { FastifyPluginAsync } from 'fastify';
import { createClient } from '@supabase/supabase-js';
import fp from 'fastify-plugin';
import type { Database } from '../types/database';

declare module 'fastify' {
  interface FastifyInstance {
    supabase: ReturnType<typeof createClient<Database>>;
  }
}

const supabasePlugin: FastifyPluginAsync = async (fastify) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables');
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    },
    db: {
      schema: 'public'
    },
    global: {
      headers: { 'x-my-custom-header': 'aggregator-backend' }
    }
  });

  // Dodajemy interceptor do automatycznej konwersji snake_case na camelCase
  const { data: { db_version }, error: versionError } = await supabase
    .from('_prisma_migrations')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (versionError) {
    fastify.log.warn('Nie udało się sprawdzić wersji bazy danych:', versionError);
  } else {
    fastify.log.info('Wersja bazy danych:', db_version);
  }

  // Rejestrujemy klienta Supabase jako dekorator Fastify
  fastify.decorate('supabase', supabase);

  // Wyczyść klienta przy zamknięciu
  fastify.addHook('onClose', async (instance) => {
    await instance.supabase.auth.signOut();
  });
};

export default fp(supabasePlugin, {
  name: 'supabase',
  dependencies: []
});