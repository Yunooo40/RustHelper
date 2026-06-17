// Payloads EXACTEMENT tels que plugin/RustLinkRelay.cs les émet (POST /webhook/rust).
// Champs : server, event, status, spawn_time, [next_respawn], timestamp.
// Si ce fichier diverge du plugin, le contrat plugin↔API est rompu → le test casse.
const now = 1718614800;

export const PLUGIN_PAYLOADS = [
  {
    name: 'bradley/destroyed (respawn 60min)',
    body: {
      server: 'My Rust Server', event: 'bradley', status: 'destroyed',
      spawn_time: now, next_respawn: now + 3600, timestamp: '2024-06-17T10:00:00.000Z',
    },
    expectedEvent: 'bradley',
    expectTimer: true,
  },
  {
    name: 'helicopter/spawned (sans respawn)',
    body: {
      server: 'My Rust Server', event: 'helicopter', status: 'spawned',
      spawn_time: now, timestamp: '2024-06-17T10:00:00.000Z',
    },
    expectedEvent: 'helicopter',
    expectTimer: false,
  },
  {
    name: 'cargo/left',
    body: {
      server: 'My Rust Server', event: 'cargo', status: 'left',
      spawn_time: now, timestamp: '2024-06-17T10:00:00.000Z',
    },
    expectedEvent: 'cargo',
    expectTimer: false,
  },
  {
    name: 'chinook/left',
    body: {
      server: 'My Rust Server', event: 'chinook', status: 'left',
      spawn_time: now, timestamp: '2024-06-17T10:00:00.000Z',
    },
    expectedEvent: 'chinook',
    expectTimer: false,
  },
];
