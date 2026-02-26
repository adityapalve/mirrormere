import type { Metadata } from 'next';
import { ensureSchema, getDbClient } from '@/lib/db';
import MapClient from './MapClient';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const db = getDbClient();
    await ensureSchema(db);
    const mapResult = await db.execute({
      sql: 'SELECT title FROM maps WHERE slug = ? LIMIT 1',
      args: [slug],
    });
    const title = mapResult.rows[0]?.title ? String(mapResult.rows[0].title) : 'Shared Photo Map';
    return {
      title,
      description: 'A shared globe of geotagged photos.',
      openGraph: {
        title,
        description: 'A shared globe of geotagged photos.',
        images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: title }],
      },
      twitter: {
        title,
        description: 'A shared globe of geotagged photos.',
        images: ['/twitter-image'],
      },
    };
  } catch {
    return {
      title: 'Shared Photo Map',
      description: 'A shared globe of geotagged photos.',
    };
  }
}

export default async function MapPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const tokenValue = sp.token;
  const token = typeof tokenValue === 'string' ? tokenValue : null;

  return <MapClient slug={slug} token={token} />;
}
