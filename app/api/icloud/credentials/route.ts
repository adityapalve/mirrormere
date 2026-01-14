import { NextRequest, NextResponse } from 'next/server';
import { hasIcloudAccount, saveIcloudCredentials } from '@/lib/icloud';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const hasCredentials = await hasIcloudAccount();
    return NextResponse.json({ hasCredentials });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to check credentials' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const appleId = body?.appleId?.trim();
    const appPassword = body?.appPassword?.trim();

    if (!appleId || !appPassword) {
      return NextResponse.json(
        { error: 'Apple ID and app-specific password are required.' },
        { status: 400 }
      );
    }

    await saveIcloudCredentials(appleId, appPassword);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save credentials' },
      { status: 500 }
    );
  }
}
