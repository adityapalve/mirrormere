import MapClient from './MapClient';

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
