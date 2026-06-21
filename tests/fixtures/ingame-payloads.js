// Payloads EXACTEMENT tels que plugin/RustLinkRelay.cs les émet pour un report
// in-game (POST /webhook/rust avec source:"ingame" + reporter).
// Champs : server, event, status, source, reporter, spawn_time, [next_respawn], timestamp.
// Si ce fichier diverge du plugin, le contrat in-game↔API est rompu → le test casse.
const now = 1718614800;

export const INGAME_PAYLOADS = [
  {
    name: 'oil_rig_small via "!small" (timer 15min)',
    body: {
      server: 'My Rust Server', event: 'small', status: 'called',
      source: 'ingame', reporter: 'BigPete',
      spawn_time: now, next_respawn: now + 900, timestamp: '2024-06-17T10:00:00.000Z',
    },
    expectedEvent: 'oil_rig_small',
    expectTimer: true,
  },
  {
    name: 'oil_rig_large via "!large" (timer 15min)',
    body: {
      server: 'My Rust Server', event: 'large', status: 'called',
      source: 'ingame', reporter: 'BigPete',
      spawn_time: now, next_respawn: now + 900, timestamp: '2024-06-17T10:00:00.000Z',
    },
    expectedEvent: 'oil_rig_large',
    expectTimer: true,
  },
  {
    name: 'deep_sea via "!deep" (annonce sans timer)',
    body: {
      server: 'My Rust Server', event: 'deep', status: 'called',
      source: 'ingame', reporter: 'Sailor',
      spawn_time: now, timestamp: '2024-06-17T10:00:00.000Z',
    },
    expectedEvent: 'deep_sea',
    expectTimer: false,
  },
  {
    name: 'helicopter via "!heli" (annonce sans timer)',
    body: {
      server: 'My Rust Server', event: 'heli', status: 'called',
      source: 'ingame', reporter: 'Sniper',
      spawn_time: now, timestamp: '2024-06-17T10:00:00.000Z',
    },
    expectedEvent: 'helicopter',
    expectTimer: false,
  },
];
