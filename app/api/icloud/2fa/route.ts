import { NextRequest, NextResponse } from 'next/server';
import { saveIcloudSession } from '@/lib/icloud';
import { syncPhotos } from '@/lib/sync';
import { createWorkerToken, getWorkerBaseUrl } from '@/lib/worker';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const sessionId = body?.sessionId?.trim();
    const code = body?.code?.trim();

    if (!sessionId || !code) {
      return NextResponse.json(
        { error: 'Session ID and 2FA code are required.' },
        { status: 400 }
      );
    }

    const token = await createWorkerToken('default');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    let response: Response;
    try {
      response = await fetch(`${getWorkerBaseUrl()}/sync/2fa`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: sessionId,
          code,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return NextResponse.json(
          { error: '2FA request timed out. Please try again.' },
          { status: 504 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to reach iCloud worker.' },
        { status: 502 }
      );
    } finally {
      clearTimeout(timeoutId);
    }

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      return NextResponse.json(
        { error: payload?.error || '2FA verification failed.' },
        { status: 502 }
      );
    }

    if (payload?.session?.file_name && payload?.session?.data) {
      await saveIcloudSession({ fileName: payload.session.file_name, data: payload.session.data });
    }

    if (payload?.status !== 'ok') {
      return NextResponse.json(
        { error: 'Unexpected worker response.' },
        { status: 500 }
      );
    }

    const indexResult = await syncPhotos();

    return NextResponse.json({
      status: 'ok',
      worker: payload,
      index: indexResult,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to verify 2FA' },
      { status: 500 }
    );
  }
}
