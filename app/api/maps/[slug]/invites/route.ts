import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, getDbClient } from '@/lib/db';
import { newId, newToken } from '@/lib/ids';

export const runtime = 'nodejs';

type CreateInviteBody = {
  ownerToken?: string;
  label?: string;
};

const COLORS = ['#60a5fa', '#34d399', '#f472b6', '#fb7185', '#a78bfa', '#fbbf24', '#f97316'];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const body = (await request.json().catch(() => ({}))) as CreateInviteBody;
    const ownerToken = (body.ownerToken || '').trim();
    const label = (body.label || '').trim() || 'Friend';

    if (!ownerToken) {
      return NextResponse.json({ error: 'Missing ownerToken' }, { status: 400 });
    }

    const db = getDbClient();
    await ensureSchema(db);

    const mapResult = await db.execute({
      sql: 'SELECT id, slug FROM maps WHERE slug = ? LIMIT 1',
      args: [slug],
    });
    if (mapResult.rows.length === 0) {
      return NextResponse.json({ error: 'Map not found' }, { status: 404 });
    }
    const mapId = String(mapResult.rows[0].id);

    const ownerInvite = await db.execute({
      sql: `
        SELECT id
        FROM map_invites
        WHERE map_id = ? AND token = ? AND role = 'owner'
        LIMIT 1
      `,
      args: [mapId, ownerToken],
    });

    if (ownerInvite.rows.length === 0) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const inviteId = newId();
    const token = newToken();
    const color = COLORS[Math.floor(Math.random() * COLORS.length)] || '#60a5fa';

    await db.execute({
      sql: `
        INSERT INTO map_invites (id, map_id, token, role, label, color)
        VALUES (?, ?, ?, 'uploader', ?, ?)
      `,
      args: [inviteId, mapId, token, label, color],
    });

    return NextResponse.json({
      id: inviteId,
      token,
      label,
      color,
      inviteUrl: `/m/${String(mapResult.rows[0].slug)}?token=${token}`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create invite' },
      { status: 500 },
    );
  }
}
