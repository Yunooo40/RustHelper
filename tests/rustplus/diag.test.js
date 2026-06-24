// Unit tests for the diagnostics helpers — pure logic, no socket, no DB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactSecrets, safePushView, summarizeMarkers, summarizeMonuments, buildDiagnostics } from '../../rustplus/diag.js';

test('redactSecrets : masque les secrets (imbriqués + en tableau), garde le reste', () => {
  const input = {
    ip: '1.2.3.4',
    playerToken: 'SECRET',
    nested: { securityToken: 'X', name: 'keep' },
    list: [{ token: 'T' }, { ok: 1 }],
  };
  assert.deepEqual(redactSecrets(input), {
    ip: '1.2.3.4',
    playerToken: '***redacted***',
    nested: { securityToken: '***redacted***', name: 'keep' },
    list: [{ token: '***redacted***' }, { ok: 1 }],
  });
});

test('redactSecrets : insensible à la casse, primitives/null intacts', () => {
  assert.deepEqual(redactSecrets({ PlayerToken: 'x', a: 1 }), { PlayerToken: '***redacted***', a: 1 });
  assert.equal(redactSecrets(null), null);
  assert.equal(redactSecrets('hi'), 'hi');
});

test('safePushView : parse le body ET masque le playerToken qui s’y cache', () => {
  const raw = { appData: [
    { key: 'channelId', value: 'pairing' },
    { key: 'body', value: JSON.stringify({ ip: '1.2.3.4', name: 'Atlas', playerToken: 'TOPSECRET' }) },
  ] };
  const view = safePushView(raw);
  assert.equal(view.channelId, 'pairing');
  assert.equal(view.body.name, 'Atlas');               // body parsé → champs visibles
  assert.equal(view.body.playerToken, '***redacted***'); // secret masqué (pas de fuite)
});

test('summarizeMarkers : types distincts + sample (avec grille) + comptes', () => {
  const markers = [
    { id: 1, type: 5, x: 200, y: 3900 },
    { id: 2, type: 5, x: 10, y: 10 },
    { id: 3, type: 8, x: 10, y: 3900 },
  ];
  const s = summarizeMarkers(markers, 4000);
  assert.equal(s.total, 3);
  assert.deepEqual(s.types, [5, 8]);
  assert.equal(s.byType['5'].count, 2);
  assert.equal(s.byType['5'].sample.grid, 'B0'); // confirme la formule de grille en live
  assert.equal(s.byType['8'].count, 1);
});

test('summarizeMarkers : entrée vide → total 0', () => {
  assert.deepEqual(summarizeMarkers(null, 4000), { total: 0, types: [], byType: {} });
});

test('summarizeMonuments : signale les oil rigs + liste les tokens', () => {
  const map = { monuments: [
    { token: 'oil_rig_small', x: 1, y: 2 },
    { token: 'large_oil_rig', x: 3, y: 4 },
    { token: 'harbor_1', x: 5, y: 6 },
  ] };
  const s = summarizeMonuments(map);
  assert.equal(s.count, 3);
  assert.deepEqual(s.oilRigs.map((m) => m.token), ['oil_rig_small', 'large_oil_rig']);
  assert.deepEqual(s.tokens, ['oil_rig_small', 'large_oil_rig', 'harbor_1']);
});

test('buildDiagnostics : assemble serveur + markers + monuments, null-safe', () => {
  const diag = buildDiagnostics({
    info: { name: 'Atlas EU', mapSize: 4000, players: 120, maxPlayers: 200 },
    map: { monuments: [{ token: 'oil_rig_small', x: 1, y: 2 }] },
    markers: [{ id: 1, type: 5, x: 200, y: 3900 }],
  });
  assert.equal(diag.server.name, 'Atlas EU');
  assert.equal(diag.server.mapSize, 4000);
  assert.equal(diag.markers.total, 1);
  assert.equal(diag.monuments.oilRigs.length, 1);
  assert.ok(diag.capturedAt);

  // No data at all → still a well-formed bundle.
  const empty = buildDiagnostics();
  assert.equal(empty.server.mapSize, null);
  assert.equal(empty.markers.total, 0);
  assert.equal(empty.monuments.count, 0);
});
