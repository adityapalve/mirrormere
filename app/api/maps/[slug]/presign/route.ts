import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { ensureSchema, getDbClient } from '@/lib/db';
import { newId } from '@/lib/ids';
import { getPresignedPutUrl, getStorageConfig, guessContentType, isSupportedPhotoKey } from '@/lib/storage';

export const runtime = 'nodejs';

type PresignBody = {
  files?: Array<{ clientId?: string; filename: string; contentType?: string; size?: number }>;
};

function safeBasename(filename: string) {
  const base = path.basename(filename || 'upload.jpg');
  return base.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const url = new URL(request.url);
    const token = (url.searchParams.get('token') || '').trim();
    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as PresignBody;
    const files = Array.isArray(body.files) ? body.files : [];
    if (files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
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
        SELECT id, expires_at
        FROM map_invites
        WHERE map_id = ? AND token = ?
        LIMIT 1
      `,
      args: [mapId, token],
    });
    if (inviteResult.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
    }

    const inviteRow = inviteResult.rows[0];
    const expiresAt = inviteRow.expires_at ? String(inviteRow.expires_at) : null;
    if (expiresAt) {
      const expiry = new Date(expiresAt);
      if (!Number.isNaN(expiry.getTime()) && expiry.getTime() < Date.now()) {
        return NextResponse.json({ error: 'Invite expired' }, { status: 403 });
      }
    }

    const config = getStorageConfig();

    const uploads = [] as Array<{
      clientId: string;
      photoId: string;
      objectKey: string;
      thumbnailKey: string;
      filename: string;
      contentType: string;
      uploadUrl: string;
      thumbnailUploadUrl: string;
    }>;

    for (const f of files) {
      const filename = safeBasename(f.filename);
      if (!isSupportedPhotoKey(filename)) {
        continue;
      }

      const clientId = (f.clientId || '').trim() || filename;

      const photoId = newId();
      const ext = path.extname(filename) || '.jpg';
      const objectKey = `${config.photoPrefix}maps/${mapId}/${photoId}${ext.toLowerCase()}`;

      const thumbnailPrefix = config.thumbnailPrefix ?? `${config.photoPrefix}thumbnails/`;
      const thumbnailKey = `${thumbnailPrefix}maps/${mapId}/${photoId}.jpg`;

      const contentType = (f.contentType || '').trim() || guessContentType(filename);

      const uploadUrl = await getPresignedPutUrl(config, objectKey, {
        contentType,
        expiresInSeconds: 600,
      });

      const thumbnailUploadUrl = await getPresignedPutUrl(config, thumbnailKey, {
        contentType: 'image/jpeg',
        expiresInSeconds: 600,
      });

      uploads.push({
        clientId,
        photoId,
        objectKey,
        thumbnailKey,
        filename,
        contentType,
        uploadUrl,
        thumbnailUploadUrl,
      });
    }

    if (uploads.length === 0) {
      return NextResponse.json({ error: 'No supported files to upload' }, { status: 400 });
    }

    return NextResponse.json({
      uploads,
      expiresInSeconds: 600,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to presign uploads' },
      { status: 500 },
    );
  }
}
