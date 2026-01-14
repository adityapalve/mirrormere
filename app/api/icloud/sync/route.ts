import { NextResponse } from 'next/server';
import { getIcloudCredentials, saveIcloudSession } from '@/lib/icloud';
import { syncPhotos } from '@/lib/sync';
import { createWorkerToken, getWorkerBaseUrl } from '@/lib/worker';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const credentials = await getIcloudCredentials();
    if (!credentials) {
      return NextResponse.json(
        { error: 'Missing iCloud credentials. Please save them first.' },
        { status: 400 }
      );
    }

    const token = await createWorkerToken(credentials.userId);
    const response = await fetch(`${getWorkerBaseUrl()}/sync`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apple_id: credentials.appleId,
        app_password: credentials.appPassword,
        session: credentials.session
          ? {
              file_name: credentials.session.fileName,
              data: credentials.session.data,
            }
          : null,
      }),
    });

    const payload = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: payload?.error || 'Worker sync failed.' },
        { status: 502 }
      );
    }

    if (payload?.session?.file_name && payload?.session?.data) {
      await saveIcloudSession(
        { fileName: payload.session.file_name, data: payload.session.data },
        credentials.userId
      );
    }

    if (payload?.status === 'needs_2fa') {
      return NextResponse.json({ status: 'needs_2fa', sessionId: payload.session_id });
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
      { error: error instanceof Error ? error.message : 'Failed to sync iCloud photos' },
      { status: 500 }
    );
  }
}
