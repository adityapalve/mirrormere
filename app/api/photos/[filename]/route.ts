import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    // Serve JPEG files from the web directory
    const photoPath = path.join(process.cwd(), '..', 'icloud_photos', 'web', filename);

    if (!fs.existsSync(photoPath)) {
      console.error('Photo not found:', photoPath);
      return NextResponse.json(
        { error: 'Photo not found' },
        { status: 404 }
      );
    }

    const fileBuffer = fs.readFileSync(photoPath);

    // All files in web directory are JPEG
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000',
      },
    });
  } catch (error) {
    console.error('Error serving photo:', error);
    return NextResponse.json(
      { error: 'Failed to load photo' },
      { status: 500 }
    );
  }
}
