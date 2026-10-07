/* Applies the D1 migrations before each test — the suite calls reset()
   in afterEach, which clears storage. applyD1Migrations tracks applied
   migrations, so this is a no-op when the schema already exists. */
import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeEach } from 'vitest';

beforeEach(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

/* The blackout in data.js is a dated switch, and while it stands every
   public page serves one holding notice instead of itself — which is
   every page test in this suite. The tests stand outside it; the ones
   that are about it set their own window and put this back. */
import data from '../site/js/data.js';
data.PAUSED.until = '';
