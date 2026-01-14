import { NextRequest, NextResponse } from 'next/server';
import { syncPhotos } from '@/lib/sync';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Number(limitParam) : undefined;

    const result = await syncPhotos(Number.isFinite(limit) ? limit : undefined);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to sync photos';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
