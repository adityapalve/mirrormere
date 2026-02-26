import { NextRequest, NextResponse } from 'next/server';
import * as exifr from 'exifr';
import path from 'path';
import { ensureSchema, getDbClient } from '@/lib/db';
import { newId } from '@/lib/ids';
import {
  getStorageConfig,
  guessContentType,
  isSupportedPhotoKey,
  putObjectBuffer,
} from '@/lib/storage';

export const runtime = 'nodejs';

type UploadResult = {
  imported: number;
  skipped: number;
  errors: string[];
};

function safeBasename(filename: string) {
  const base = path.basename(filename);
  return base.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const result: UploadResult = { imported: 0, skipped: 0, errors: [] };

  try {
    const { slug } = await params;
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

    const inviteId = String(inviteRow.id);
    const form = await request.formData();
    const files = form.getAll('files').filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    const config = getStorageConfig();

    for (const file of files) {
      const originalName = file.name || 'upload.jpg';
      const safeName = safeBasename(originalName);
      const ext = path.extname(safeName) || '.jpg';

      if (!isSupportedPhotoKey(safeName)) {
        result.skipped += 1;
        continue;
      }

      try {
        const photoId = newId();
        const objectKey = `${config.photoPrefix}maps/${mapId}/${photoId}${ext.toLowerCase()}`;

        const ab = await file.arrayBuffer();
        const buffer = Buffer.from(ab);

        await putObjectBuffer(config, objectKey, buffer, guessContentType(safeName));

        const exif = await exifr.parse(buffer, { tiff: true, exif: true }).catch(() => null);
        const gps = await exifr.gps(buffer).catch(() => null);

        const latitude = gps?.latitude ?? null;
        const longitude = gps?.longitude ?? null;
        const altitude = (gps as { altitude?: number } | null)?.altitude ?? null;
        const hasGps = latitude !== null && longitude !== null;

        const dateTakenRaw = (exif as { DateTimeOriginal?: unknown; DateTime?: unknown } | null)?.DateTimeOriginal
          ?? (exif as { DateTime?: unknown } | null)?.DateTime
          ?? null;
        const dateTaken = dateTakenRaw instanceof Date
          ? dateTakenRaw.toISOString()
          : dateTakenRaw
            ? String(dateTakenRaw)
            : null;

        const make = (exif as { Make?: unknown } | null)?.Make ?? null;
        const model = (exif as { Model?: unknown } | null)?.Model ?? null;
        const width = normalizeNumber((exif as { ExifImageWidth?: unknown; ImageWidth?: unknown } | null)?.ExifImageWidth
          ?? (exif as { ImageWidth?: unknown } | null)?.ImageWidth);
        const height = normalizeNumber((exif as { ExifImageHeight?: unknown; ImageHeight?: unknown } | null)?.ExifImageHeight
          ?? (exif as { ImageHeight?: unknown } | null)?.ImageHeight);

        await db.execute({
          sql: `
            INSERT INTO map_photos (
              id,
              map_id,
              invite_id,
              object_key,
              thumbnail_key,
              filename,
              has_gps,
              gps_lat,
              gps_lon,
              gps_alt,
              camera_make,
              camera_model,
              date_taken,
              width,
              height
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          args: [
            photoId,
            mapId,
            inviteId,
            objectKey,
            null,
            safeName,
            hasGps ? 1 : 0,
            latitude,
            longitude,
            altitude,
            make ? String(make) : null,
            model ? String(model) : null,
            dateTaken,
            width,
            height,
          ],
        });

        result.imported += 1;
      } catch (error) {
        result.errors.push(
          `Failed to import ${safeName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed', ...result },
      { status: 500 },
    );
  }
}

function normalizeNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}
