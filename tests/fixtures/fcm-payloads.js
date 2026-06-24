// Fixtures for FCM pairing notifications (Phase 7.2). Two real-world shapes:
//  - appDataShape: push-receiver 0.0.3 ON_DATA_RECEIVED (object.appData = [{key,value}]).
//  - dataBodyShape: decrypted ON_NOTIFICATION_RECEIVED (data.body = JSON string).
// The `body` JSON mirrors the README "Example Output" of @liamcottle/rustplus.js.

export const serverBody = {
  img: '',
  port: '28017',
  ip: '203.0.113.7',
  name: 'Rustafied EU Main',
  id: '11111111-2222-3333-4444-555555555555',
  type: 'server',
  url: '',
  desc: 'a server',
  playerId: '76561190000000001',
  playerToken: '123456789',
};

// Smart-switch/alarm pairing — must be ignored (type !== 'server').
export const entityBody = {
  ...serverBody,
  type: 'entity',
  entityId: '987654',
  entityName: 'Front Door',
  entityType: '1',
};

// 0.0.3 path: raw DataMessageStanza object with appData array + persistentId.
export function appDataShape(body = serverBody, persistentId = 'pid-1') {
  return {
    persistentId,
    appData: [
      { key: 'body', value: JSON.stringify(body) },
      { key: 'channelId', value: 'pairing' },
    ],
  };
}

// Decrypted path: { data: { body: '<json>' , ... } }.
export function dataBodyShape(body = serverBody) {
  return {
    data: { body: JSON.stringify(body), channelId: 'pairing', title: 'Pairing' },
    from: 'rust-companion',
    priority: 'high',
  };
}

export default { serverBody, entityBody, appDataShape, dataBodyShape };
