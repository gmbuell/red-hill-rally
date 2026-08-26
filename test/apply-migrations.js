/* Applies the D1 migrations before each test — the suite calls reset()
   in afterEach, which clears storage. applyD1Migrations tracks applied
   migrations, so this is a no-op when the schema already exists. */
import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeEach } from 'vitest';

beforeEach(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});
