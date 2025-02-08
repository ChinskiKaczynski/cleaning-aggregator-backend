import path from 'path';

const config = {
  test: {
    client: 'pg',
    connection: {
      host: process.env.SUPABASE_HOST,
      user: 'postgres',
      password: process.env.SUPABASE_DB_PASSWORD,
      database: 'postgres',
      port: 5432,
      ssl: { rejectUnauthorized: false }
    },
    migrations: {
      directory: path.resolve('./src/database/migrations'),
      extension: 'js'
    },
    seeds: {
      directory: './src/database/seeds'
    }
  }
};

export default config;
