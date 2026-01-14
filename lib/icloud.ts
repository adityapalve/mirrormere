import { decryptValue, encryptValue } from './crypto';
import { ensureSchema, getDbClient } from './db';

export type IcloudSession = {
  fileName: string;
  data: string;
};

export type IcloudCredentials = {
  userId: string;
  appleId: string;
  appPassword: string;
  session?: IcloudSession | null;
};

const DEFAULT_USER_ID = 'default';

export async function hasIcloudAccount(userId = DEFAULT_USER_ID) {
  const db = getDbClient();
  await ensureSchema(db);

  const result = await db.execute({
    sql: 'SELECT user_id FROM icloud_accounts WHERE user_id = ?',
    args: [userId],
  });

  return result.rows.length > 0;
}

export async function getIcloudCredentials(userId = DEFAULT_USER_ID): Promise<IcloudCredentials | null> {
  const db = getDbClient();
  await ensureSchema(db);

  const result = await db.execute({
    sql: `
      SELECT apple_id_enc, app_password_enc, session_file_name, session_data_enc
      FROM icloud_accounts
      WHERE user_id = ?
    `,
    args: [userId],
  });

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  const appleId = decryptValue(String(row.apple_id_enc));
  const appPassword = decryptValue(String(row.app_password_enc));

  const sessionFileName = row.session_file_name ? String(row.session_file_name) : null;
  const sessionDataEnc = row.session_data_enc ? String(row.session_data_enc) : null;
  const session = sessionFileName && sessionDataEnc
    ? { fileName: sessionFileName, data: decryptValue(sessionDataEnc) }
    : null;

  return {
    userId,
    appleId,
    appPassword,
    session,
  };
}

export async function saveIcloudCredentials(
  appleId: string,
  appPassword: string,
  userId = DEFAULT_USER_ID
) {
  const db = getDbClient();
  await ensureSchema(db);

  const appleIdEnc = encryptValue(appleId);
  const appPasswordEnc = encryptValue(appPassword);

  await db.execute({
    sql: `
      INSERT INTO icloud_accounts (
        user_id,
        apple_id_enc,
        app_password_enc,
        session_file_name,
        session_data_enc,
        updated_at
      )
      VALUES (?, ?, ?, NULL, NULL, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        apple_id_enc = excluded.apple_id_enc,
        app_password_enc = excluded.app_password_enc,
        session_file_name = NULL,
        session_data_enc = NULL,
        updated_at = CURRENT_TIMESTAMP
    `,
    args: [userId, appleIdEnc, appPasswordEnc],
  });
}

export async function saveIcloudSession(
  session: IcloudSession,
  userId = DEFAULT_USER_ID
) {
  const db = getDbClient();
  await ensureSchema(db);

  const sessionDataEnc = encryptValue(session.data);

  await db.execute({
    sql: `
      UPDATE icloud_accounts
      SET
        session_file_name = ?,
        session_data_enc = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `,
    args: [session.fileName, sessionDataEnc, userId],
  });
}
