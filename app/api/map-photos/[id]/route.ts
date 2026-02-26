import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, getDbClient } from '@/lib/db';
import { buildPublicUrl, getObjectBuffer, getStorageConfig } from '@/lib/storage';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const type = url.searchParams.get('type') ?? 'original';

    const db = getDbClient();
    await ensureSchema(db);

    const rowResult = await db.execute({
      sql: 'SELECT object_key, thumbnail_key FROM map_photos WHERE id = ? LIMIT 1',
      args: [id],
    });
    if (rowResult.rows.length === 0) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }

    const row = rowResult.rows[0];
    const objectKey = String(row.object_key);
    const thumbnailKey = row.thumbnail_key ? String(row.thumbnail_key) : null;
    const selectedKey = type === 'thumbnail' && thumbnailKey ? thumbnailKey : objectKey;

    const storageConfig = getStorageConfig();
    if (storageConfig.publicBaseUrl) {
      const publicUrl = buildPublicUrl(storageConfig, selectedKey);
      if (publicUrl) return NextResponse.redirect(publicUrl);
    }

    const { buffer, contentType } = await getObjectBuffer(storageConfig, selectedKey);
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType || 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load photo' },
      { status: 500 },
    );
  }
}
