// Pipeline simulator — fires the FULL range of plugin payloads at the API so you can
// watch the whole bot light up (event timers + kill feed) WITHOUT a Rust server.
// Doubles as an end-to-end smoke test: exits non-zero if any request fails.
//
//   node scripts/simulate.js                       # local, http://localhost:3000
//   npm run simulate
//   API_BASE=https://my-app.up.railway.app WEBHOOK_SECRET=xxx node scripts/simulate.js
//
// Env:
//   API_BASE        API base URL          (default http://localhost:3000)
//   WEBHOOK_SECRET  must match the server (sent as x-webhook-secret)
//   SERVER          demo server name      (default "Atlas - EU 2X Medium")
//
// To SEE Discord embeds, the bot must be running AND you must have run /setup in your
// guild with the SAME server name first. Otherwise this still validates the API + DB
// pipeline (the responses + the read-back below).

const BASE = (process.env.API_BASE ?? 'http://localhost:3000').replace(/\/+$/, '');
const SECRET = process.env.WEBHOOK_SECRET ?? '';
const SERVER = process.env.SERVER ?? 'Atlas - EU 2X Medium';

const headers = {
  'Content-Type': 'application/json',
  // Don't keep sockets alive: lets the process exit cleanly instead of tearing down
  // undici's pool on exit (which crashes with a libuv assertion on Windows).
  Connection: 'close',
  ...(SECRET ? { 'x-webhook-secret': SECRET } : {}),
};
const now = () => Math.floor(Date.now() / 1000);
const minutes = (m) => now() + m * 60;

let failures = 0;

async function req(method, path, body) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const json = await res.json().catch(() => ({}));
    const ok = res.ok && json.ok !== false;
    if (!ok) failures++;
    return { ok, status: res.status, json };
  } catch (err) {
    failures++;
    return { ok: false, status: 0, json: { error: err.message } };
  }
}

const mark = (ok) => (ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m');

// ── Scenario: a believable "server status" snapshot ───────────────────────────
// next_respawn drives the timer; status is just a human label on the embed.
const EVENTS = [
  { event: 'cargo', status: 'spawned', inMin: 50 },
  { event: 'helicopter', status: 'called', inMin: 40 },
  { event: 'chinook', status: 'spawned', inMin: 30 },
  { event: 'bradley', status: 'destroyed', inMin: 60 },
  { event: 'oil_rig_small', status: 'called', inMin: 15 },
  { event: 'oil_rig_large', status: 'called', inMin: 15 },
  { event: 'deep_sea', status: 'spawned', inMin: 90 },
];

// Kill feed. steam ids are fake; if you've /link-ed one of these to a Discord user the
// feed will show a mention instead of a plain name. A null killer = NPC/environment.
const DEATHS = [
  { victim_name: 'NoobSlayer', victim_id: '76561190000000001', killer_name: 'BigPete', killer_id: '76561190000000002', cause: 'Rifle Bullet (AK)', distance: 142.3 },
  { victim_name: 'BigPete', victim_id: '76561190000000002', killer_name: 'NoobSlayer', killer_id: '76561190000000001', cause: 'Bolt Action Rifle', distance: 88 },
  { victim_name: 'WanderingZerg', victim_id: '76561190000000003', killer_name: 'Scientist', killer_id: null, cause: 'Scientist', distance: 11.5 },
  { victim_name: 'ClumsyCarl', victim_id: '76561190000000004', killer_name: null, killer_id: null, cause: 'Fall' },
];

async function main() {
  console.log(`\nRustLink pipeline simulator → ${BASE}`);
  console.log(`Server: "${SERVER}"  ${SECRET ? '(auth on)' : '(no secret)'}\n`);

  const health = await req('GET', '/health');
  console.log(`${mark(health.ok)} GET /health  [${health.status}]`);
  if (!health.ok) {
    console.error(`\n✗ API unreachable at ${BASE}. Start it (npm start) or check API_BASE.\n`);
    process.exitCode = 1;
    return;
  }

  console.log('\n— Events —');
  for (const e of EVENTS) {
    const r = await req('POST', '/webhook/rust', {
      server: SERVER,
      event: e.event,
      status: e.status,
      spawn_time: now(),
      next_respawn: minutes(e.inMin),
      timestamp: new Date().toISOString(),
    });
    console.log(`${mark(r.ok)} ${e.event.padEnd(14)} ${e.status.padEnd(10)} in ${e.inMin}m  [${r.status}]`);
  }

  console.log('\n— Kill feed —');
  for (const d of DEATHS) {
    const r = await req('POST', '/webhook/death', { server: SERVER, ...d });
    const by = d.killer_name ? `← ${d.killer_name}` : '(environment)';
    console.log(`${mark(r.ok)} ${d.victim_name.padEnd(14)} ${by} ${d.cause ? `(${d.cause})` : ''}  [${r.status}]`);
  }

  console.log('\n— Resulting state —');
  const q = `?server=${encodeURIComponent(SERVER)}`;
  const timers = await req('GET', `/timers${q}`);
  const events = await req('GET', `/events${q}&limit=10`);
  const countOf = (j) => (Array.isArray(j) ? j.length : Array.isArray(j?.timers) ? j.timers.length : Array.isArray(j?.events) ? j.events.length : '?');
  console.log(`${mark(timers.ok)} GET /timers  → ${countOf(timers.json)} active timer(s)`);
  console.log(`${mark(events.ok)} GET /events  → ${countOf(events.json)} recent event(s)`);

  const total = EVENTS.length + DEATHS.length + 3;
  console.log(`\n${failures === 0 ? '\x1b[32m' : '\x1b[31m'}${total - failures}/${total} requests ok\x1b[0m`);
  if (failures) console.log('Some requests failed — check the secret (WEBHOOK_SECRET) and that the API is up.');
  else console.log('Pipeline OK. If the bot is running + /setup done for this server, check Discord. 🎉');
  process.exitCode = failures ? 1 : 0;
}

main();
