import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, getDbClient } from '@/lib/db';

export const runtime = 'nodejs';

type IngestBody = {
  uploads?: Array<{
    photoId: string;
    objectKey: string;
    thumbnailKey?: string | null;
    filename: string;
    gps?: { latitude: number; longitude: number; altitude?: number | null } | null;
    dateTaken?: string | null;
    cameraMake?: string | null;
    cameraModel?: string | null;
    width?: number | null;
    height?: number | null;
  }>;
};

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

    const body = (await request.json().catch(() => ({}))) as IngestBody;
    const uploads = Array.isArray(body.uploads) ? body.uploads : [];
    if (uploads.length === 0) {
      return NextResponse.json({ error: 'No uploads provided' }, { status: 400 });
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

    let imported = 0;
    const errors: string[] = [];

    for (const u of uploads) {
      try {
        const gps = u.gps ?? null;
        const latitude = gps?.latitude ?? null;
        const longitude = gps?.longitude ?? null;
        const altitude = gps && 'altitude' in gps ? gps.altitude ?? null : null;
        const hasGps = latitude !== null && longitude !== null;

        await db.execute({
          sql: `
            INSERT OR REPLACE INTO map_photos (
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
            String(u.photoId),
            mapId,
            inviteId,
            String(u.objectKey),
            u.thumbnailKey ? String(u.thumbnailKey) : null,
            String(u.filename),
            hasGps ? 1 : 0,
            latitude,
            longitude,
            altitude,
            u.cameraMake ?? null,
            u.cameraModel ?? null,
            u.dateTaken ?? null,
            u.width ?? null,
            u.height ?? null,
          ],
        });

        imported += 1;
      } catch (e) {
        errors.push(e instanceof Error ? e.message : 'Failed to ingest upload');
      }
    }

    return NextResponse.json({ imported, errors });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to ingest uploads' },
      { status: 500 },
    );
  }
}
