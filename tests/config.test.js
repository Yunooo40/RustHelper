// Le chemin DB ":memory:" (et "") ne doit PAS passer par path.resolve(),
// sinon SQLite reçoit un faux chemin (et sur Windows, ":" est illégal).
process.env.DATABASE_PATH = ':memory:';

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { config } = await import('../config.js');

test('config: ":memory:" reste tel quel (pas de path.resolve)', () => {
  assert.equal(config.db.path, ':memory:');
});
