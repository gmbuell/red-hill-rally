/* Applies the D1 migrations before each test. Runs per-test (not once)
   because the suite calls reset() in afterEach, which clears storage —
   applyD1Migrations tracks applied migrations, so this is a no-op when
   the schema already exists. */
import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeEach } from 'vitest';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

beforeEach(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});
