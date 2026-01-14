import { SignJWT } from 'jose';

const DEFAULT_AUDIENCE = 'icloud-worker';

export function getWorkerBaseUrl() {
  const baseUrl = process.env.WORKER_BASE_URL;
  if (!baseUrl) {
    throw new Error('Missing WORKER_BASE_URL.');
  }

  return baseUrl.replace(/\/$/, '');
}

export async function createWorkerToken(userId: string) {
  const secret = process.env.WORKER_JWT_SECRET;
  if (!secret) {
    throw new Error('Missing WORKER_JWT_SECRET.');
  }

  const key = new TextEncoder().encode(secret);

  return new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setSubject(userId)
    .setAudience(DEFAULT_AUDIENCE)
    .setExpirationTime('5m')
    .sign(key);
}
