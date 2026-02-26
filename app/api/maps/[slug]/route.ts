import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, getDbClient } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const db = getDbClient();
    await ensureSchema(db);

    const mapResult = await db.execute({
      sql: 'SELECT id, slug, title, created_at FROM maps WHERE slug = ? LIMIT 1',
      args: [slug],
    });

    if (mapResult.rows.length === 0) {
      return NextResponse.json({ error: 'Map not found' }, { status: 404 });
    }

    const mapRow = mapResult.rows[0];
    const mapId = String(mapRow.id);

    const counts = await db.execute({
      sql: `
        SELECT
          (SELECT COUNT(1) FROM map_photos WHERE map_id = ?) AS photo_count,
          (SELECT COUNT(1) FROM map_photos WHERE map_id = ? AND gps_lat IS NOT NULL AND gps_lon IS NOT NULL) AS geo_count,
          (SELECT COUNT(1) FROM map_invites WHERE map_id = ?) AS invite_count
      `,
      args: [mapId, mapId, mapId],
    });

    const countRow = counts.rows[0] || {};

    return NextResponse.json({
      id: mapId,
      slug: String(mapRow.slug),
      title: mapRow.title ? String(mapRow.title) : null,
      createdAt: mapRow.created_at ? String(mapRow.created_at) : null,
      counts: {
        photos: Number((countRow as { photo_count?: unknown }).photo_count ?? 0),
        geotagged: Number((countRow as { geo_count?: unknown }).geo_count ?? 0),
        invites: Number((countRow as { invite_count?: unknown }).invite_count ?? 0),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load map' },
      { status: 500 },
    );
  }
}
