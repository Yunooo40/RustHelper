// Steam fields EXACTEMENT tels que plugin/RustLinkRelay.cs les envoie à
// POST /link/claim (le `code` est saisi par le joueur, injecté par le test).
// steam_id = IPlayer.Id (SteamID 64), steam_name = IPlayer.Name.
export const LINK_STEAM = {
  steam_id: '76561198000000000',
  steam_name: 'BigPete',
};
