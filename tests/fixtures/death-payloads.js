// Payload EXACTEMENT tel que plugin/RustLinkRelay.cs l'émet pour une mort de joueur
// (POST /webhook/death). steam ids = UserIDString, distance en mètres.
export const DEATH_PAYLOAD = {
  server: 'My Rust Server',
  victim_id: '76561190000000001',
  victim_name: 'Victim',
  killer_id: '76561190000000002',
  killer_name: 'Killer',
  cause: 'Bullet',
  distance: 42.5,
};
