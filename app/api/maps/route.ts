import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, getDbClient } from '@/lib/db';
import { makeSlug, newId, newToken } from '@/lib/ids';

export const runtime = 'nodejs';

type CreateMapBody = {
  title?: string;
  ownerName?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as CreateMapBody;
    const title = (body.title || '').trim() || 'Shared map';
    const ownerName = (body.ownerName || '').trim() || 'Owner';

    const db = getDbClient();
    await ensureSchema(db);

    const mapId = newId();
    const slug = makeSlug(title);

    await db.execute({
      sql: 'INSERT INTO maps (id, slug, title) VALUES (?, ?, ?)',
      args: [mapId, slug, title],
    });

    const ownerInviteId = newId();
    const ownerToken = newToken();

    await db.execute({
      sql: `
        INSERT INTO map_invites (id, map_id, token, role, label, color)
        VALUES (?, ?, ?, 'owner', ?, ?)
      `,
      args: [ownerInviteId, mapId, ownerToken, ownerName, '#fbbf24'],
    });

    return NextResponse.json({
      id: mapId,
      slug,
      title,
      viewUrl: `/m/${slug}`,
      ownerToken,
      inviteUrl: `/m/${slug}?token=${ownerToken}`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create map' },
      { status: 500 },
    );
  }
}
