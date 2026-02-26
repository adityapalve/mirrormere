import { createClient, type Client } from '@libsql/client';

let client: Client | null = null;

export function getDbClient(): Client {
  const databaseUrl = process.env.TURSO_DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('Missing TURSO_DATABASE_URL. Set it to your libSQL/Turso URL.');
  }

  if (!client) {
    client = createClient({
      url: databaseUrl,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }

  return client;
}

export async function ensureSchema(db: Client) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS photo_sources (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      label TEXT NOT NULL,
      config_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      object_key TEXT NOT NULL,
      thumbnail_key TEXT,
      filename TEXT NOT NULL,
      has_gps INTEGER NOT NULL DEFAULT 0,
      gps_lat REAL,
      gps_lon REAL,
      gps_alt REAL,
      camera_make TEXT,
      camera_model TEXT,
      date_taken TEXT,
      width INTEGER,
      height INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (source_id) REFERENCES photo_sources(id)
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS icloud_accounts (
      user_id TEXT PRIMARY KEY,
      apple_id_enc TEXT NOT NULL,
      app_password_enc TEXT NOT NULL,
      session_file_name TEXT,
      session_data_enc TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.execute(
    'CREATE UNIQUE INDEX IF NOT EXISTS photos_source_object_key ON photos(source_id, object_key);'
  );

  // Collaborative maps (new product direction)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS maps (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS map_invites (
      id TEXT PRIMARY KEY,
      map_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      label TEXT,
      color TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT,
      FOREIGN KEY (map_id) REFERENCES maps(id)
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS map_photos (
      id TEXT PRIMARY KEY,
      map_id TEXT NOT NULL,
      invite_id TEXT,
      object_key TEXT NOT NULL,
      thumbnail_key TEXT,
      filename TEXT NOT NULL,
      has_gps INTEGER NOT NULL DEFAULT 0,
      gps_lat REAL,
      gps_lon REAL,
      gps_alt REAL,
      camera_make TEXT,
      camera_model TEXT,
      date_taken TEXT,
      width INTEGER,
      height INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (map_id) REFERENCES maps(id),
      FOREIGN KEY (invite_id) REFERENCES map_invites(id)
    );
  `);

  await db.execute(
    'CREATE INDEX IF NOT EXISTS map_photos_map_id_date_taken ON map_photos(map_id, date_taken);'
  );

  await db.execute(
    'CREATE INDEX IF NOT EXISTS map_photos_map_id_gps ON map_photos(map_id, gps_lat, gps_lon);'
  );
}
