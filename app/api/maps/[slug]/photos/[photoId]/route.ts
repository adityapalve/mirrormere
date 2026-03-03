import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, getDbClient } from '@/lib/db';
import { deleteObject, getStorageConfig } from '@/lib/storage';

export const runtime = 'nodejs';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; photoId: string }> },
) {
  try {
    const { slug, photoId } = await params;
    const url = new URL(request.url);
    const token = (url.searchParams.get('token') || '').trim();
    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    const db = getDbClient();
    await ensureSchema(db);

    const mapResult = await db.execute({
      sql: 'SELECT id FROM maps WHERE slug = ? LIMIT 1',
      args: [slug],
    });
    if (mapResult.rows.length === 0) {
      return NextResponse.json({ error: 'Map not found' }, { status: 404 });
    }
    const mapId = String(mapResult.rows[0].id);

    const inviteResult = await db.execute({
      sql: `
        SELECT id, role
        FROM map_invites
        WHERE map_id = ? AND token = ?
        LIMIT 1
      `,
      args: [mapId, token],
    });
    if (inviteResult.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
    }

    const inviteId = String(inviteResult.rows[0].id);
    const role = inviteResult.rows[0].role ? String(inviteResult.rows[0].role) : 'uploader';

    const photoResult = await db.execute({
      sql: `
        SELECT id, invite_id, object_key, thumbnail_key
        FROM map_photos
        WHERE id = ? AND map_id = ?
        LIMIT 1
      `,
      args: [photoId, mapId],
    });

    if (photoResult.rows.length === 0) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }

    const row = photoResult.rows[0];
    const photoInviteId = row.invite_id ? String(row.invite_id) : null;
    if (role !== 'owner' && photoInviteId !== inviteId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const objectKey = String(row.object_key);
    const thumbnailKey = row.thumbnail_key ? String(row.thumbnail_key) : null;

    const storageConfig = getStorageConfig();

    await Promise.all([
      deleteObject(storageConfig, objectKey).catch(() => null),
      thumbnailKey ? deleteObject(storageConfig, thumbnailKey).catch(() => null) : Promise.resolve(null),
    ]);

    await db.execute({
      sql: 'DELETE FROM map_photos WHERE id = ? AND map_id = ?',
      args: [photoId, mapId],
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete photo' },
      { status: 500 },
    );
  }
}
