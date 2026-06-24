// teamEventEmbed is pure (no socket/DB) — assert the rendered embed per kind.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { teamEventEmbed } from '../../bot/lib/embeds.js';

test('teamEventEmbed: description + couleur + footer par kind', () => {
  const join = teamEventEmbed({ serverName: 'Srv', kind: 'join', member: { name: 'Bob' } });
  assert.match(join.data.description, /Bob.*connect/);
  assert.equal(join.data.color, 0x57f287);
  assert.equal(join.data.footer.text, 'RustLink · Srv');

  const death = teamEventEmbed({ serverName: 'Srv', kind: 'death', member: { name: 'Bob' } });
  assert.match(death.data.description, /Bob.*mort/);
  assert.equal(death.data.color, 0xed4245);
});
