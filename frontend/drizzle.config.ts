import { env } from '@/env';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: env.POSTGRES_URL,
  },
  tablesFilter: ['qario_*'],
});
