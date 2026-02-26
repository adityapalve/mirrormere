import { randomBytes, randomUUID } from 'crypto';

export function newId() {
  return randomUUID();
}

export function newToken(byteLength = 24) {
  return randomBytes(byteLength).toString('base64url');
}

export function makeSlug(input: string | null | undefined) {
  const base = (input || 'map')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 32);

  const suffix = randomBytes(4).toString('hex');
  return `${base || 'map'}-${suffix}`;
}
