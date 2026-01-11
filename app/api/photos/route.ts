import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    // Path to the photo metadata JSON file
    const metadataPath = path.join(process.cwd(), '..', 'icloud_photos', 'photo_metadata.json');

    // Check if file exists
    if (!fs.existsSync(metadataPath)) {
      return NextResponse.json(
        { error: 'Metadata file not found. Please run extract_photo_metadata.py first.' },
        { status: 404 }
      );
    }

    // Read and parse the metadata
    const data = fs.readFileSync(metadataPath, 'utf-8');
    const photos = JSON.parse(data);

    return NextResponse.json(photos);
  } catch (error) {
    console.error('Error reading photo metadata:', error);
    return NextResponse.json(
      { error: 'Failed to load photo metadata' },
      { status: 500 }
    );
  }
}
