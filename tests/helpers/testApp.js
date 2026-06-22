// Harness de test partagé : DB SQLite en mémoire + app Express + helper HTTP.
//
// IMPORTANT : les variables d'env DOIVENT être posées AVANT le chargement des
// modules backend, car config.js lit process.env une seule fois à l'import.
// Les imports statiques ESM sont hoistés → on utilise import() dynamique APRÈS
// avoir muté process.env.
process.env.DATABASE_PATH = ':memory:';
process.env.WEBHOOK_SECRET = ''; // auth désactivée par défaut ; les tests la mutent à chaud

const { config } = await import('../../config.js');
const { createApiServer } = await import('../../backend/server.js');
const { db } = await import('../../backend/db.js');

export { config, db };
export const app = createApiServer();

// Vide les tables entre les tests (la DB :memory: persiste sur tout le fichier).
export function resetDb() {
  db.exec('DELETE FROM timers; DELETE FROM events; DELETE FROM servers; DELETE FROM links; DELETE FROM link_codes; DELETE FROM deaths;');
}

// Démarre l'app sur un port éphémère. Retourne { url, close }.
export async function startTestServer() {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
