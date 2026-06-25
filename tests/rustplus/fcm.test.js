// Unit tests for the FCM Smart Alarm parsing/matching + the handleNotification bridge.
import { db, resetDb } from '../helpers/testApp.js'; // first: sets DATABASE_PATH=:memory:
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { extractData, classifyNotification, matchPairingServerId } from '../../rustplus/fcm.js';
import { handleAlarmNotification } from '../../rustplus/fcmManager.js';
import * as Pairings from '../../backend/models/pairing.js';
import { bus, ALARM_EVENT } from '../../shared/bus.js';

// Shape A — ON_DATA_RECEIVED: appData is an array of { key, value }.
const alarmAppData = (over = {}) => ({
  appData: [
    { key: 'channelId', value: 'alarm' },
    { key: 'title', value: 'Base Alarm' },
    { key: 'message', value: 'Your base is under attack!' },
    { key: 'body', value: JSON.stringify({ ip: '1.2.3.4', port: '28083', name: 'Atlas EU', ...over }) },
  ],
});

// Shape B — ON_NOTIFICATION_RECEIVED: decrypted notification with a nested data object.
const alarmNotif = {
  notification: {
    data: {
      channelId: 'alarm',
      title: 'Raid',
      message: 'Raid in progress!',
      body: JSON.stringify({ ip: '5.6.7.8', port: '28015', name: 'Atlas US' }),
    },
  },
  persistentId: 'abc',
};

const pairing = {
  appData: [
    { key: 'channelId', value: 'pairing' },
    { key: 'body', value: JSON.stringify({ ip: '1.2.3.4', port: '28083', name: 'Atlas EU', entityName: 'Smart Alarm', playerToken: 'secret' }) },
  ],
};

const team = { appData: [{ key: 'channelId', value: 'team' }, { key: 'body', value: '{}' }] };

test('extractData : aplatit le tableau appData en objet', () => {
  const data = extractData(alarmAppData());
  assert.equal(data.channelId, 'alarm');
  assert.equal(data.title, 'Base Alarm');
});

test('extractData : tolère notification.data, et garbage → {}', () => {
  assert.equal(extractData(alarmNotif).channelId, 'alarm');
  assert.deepEqual(extractData(null), {});
  assert.deepEqual(extractData(42), {});
});

test('classifyNotification : alarme (forme appData) → kind alarm + serveur', () => {
  const n = classifyNotification(alarmAppData());
  assert.equal(n.kind, 'alarm');
  assert.equal(n.title, 'Base Alarm');
  assert.equal(n.message, 'Your base is under attack!');
  assert.deepEqual(n.server, { ip: '1.2.3.4', port: '28083', name: 'Atlas EU' });
});

test('classifyNotification : alarme (forme notification.data) → kind alarm', () => {
  const n = classifyNotification(alarmNotif);
  assert.equal(n.kind, 'alarm');
  assert.equal(n.server.ip, '5.6.7.8');
});

test('classifyNotification : pairing → kind pairing, team → other, sans channelId → null', () => {
  assert.equal(classifyNotification(pairing).kind, 'pairing');
  assert.equal(classifyNotification(team).kind, 'other');
  assert.equal(classifyNotification({ appData: [] }), null);
});

test('classifyNotification : body JSON cassé → pas de crash, champs serveur null', () => {
  const broken = { appData: [{ key: 'channelId', value: 'alarm' }, { key: 'body', value: '{not json' }] };
  const n = classifyNotification(broken);
  assert.equal(n.kind, 'alarm');
  assert.deepEqual(n.server, { ip: null, port: null, name: null });
});

test('matchPairingServerId : exact ip+port, repli ip seul, sinon null', () => {
  const pairings = [
    { server_ip: '1.2.3.4', app_port: 28083, server_id: 7 },
    { server_ip: '9.9.9.9', app_port: 28015, server_id: 8 },
  ];
  assert.equal(matchPairingServerId({ ip: '1.2.3.4', port: '28083' }, pairings), 7);
  assert.equal(matchPairingServerId({ ip: '1.2.3.4', port: '40000' }, pairings), 7); // port différent → repli ip
  assert.equal(matchPairingServerId({ ip: '0.0.0.0', port: '1' }, pairings), null);
  assert.equal(matchPairingServerId({ ip: null }, pairings), null);
  assert.equal(matchPairingServerId({ ip: '1.2.3.4' }, []), null);
});

// ── handleAlarmNotification : résolution serveur + émission bus ───────────────────────

beforeEach(() => {
  resetDb();
  bus.removeAllListeners(ALARM_EVENT);
});

test('handleAlarmNotification : alarme → résout serveur via pairing + émet ALARM_EVENT', async () => {
  db.prepare("INSERT INTO servers (id, name, channel_id) VALUES (7, 'Atlas EU', 'chan-1')").run();
  Pairings.add({ serverId: 7, serverIp: '1.2.3.4', appPort: 28083, steamId: 's1', playerToken: 't1' });

  const emitted = new Promise((resolve) => bus.once(ALARM_EVENT, resolve));
  const note = handleAlarmNotification(alarmAppData());
  assert.equal(note.kind, 'alarm');

  const payload = await emitted;
  assert.equal(payload.serverName, 'Atlas EU');
  assert.equal(payload.channelId, 'chan-1');
  assert.equal(payload.title, 'Base Alarm');
  assert.equal(payload.message, 'Your base is under attack!');
});

test('handleAlarmNotification : non-alarme (team) → null, aucune émission', () => {
  let fired = false;
  bus.once(ALARM_EVENT, () => { fired = true; });
  assert.equal(handleAlarmNotification(team), null);
  assert.equal(fired, false);
});

test('handleAlarmNotification : alarme sans pairing → repli sur le nom, channelId null', async () => {
  const emitted = new Promise((resolve) => bus.once(ALARM_EVENT, resolve));
  handleAlarmNotification(alarmNotif); // serveur "Atlas US" non tracké
  const payload = await emitted;
  assert.equal(payload.serverName, 'Atlas US');
  assert.equal(payload.channelId, null);
});
