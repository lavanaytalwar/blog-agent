import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const TOKEN_URI = 'https://oauth2.googleapis.com/token';

type ServiceAccount = { client_email: string; private_key: string };
type Cached = { token: string; expiresAt: number };

let cached: Cached | null = null;

const b64url = (input: Buffer | string) =>
  Buffer.from(input).toString('base64url');

async function loadKey(): Promise<ServiceAccount> {
  // Either the raw JSON (Vercel env var) or a path to it (local).
  const inline = process.env.GSC_KEY_JSON;
  if (inline) return JSON.parse(inline) as ServiceAccount;

  const path = process.env.GSC_KEY_FILE ?? '.secrets/gsc.json';
  return JSON.parse(await readFile(path, 'utf8')) as ServiceAccount;
}

/**
 * Mints a Google access token from the service-account key using a signed JWT.
 * Hand-rolled against node:crypto rather than google-auth-library — it is ~30
 * lines, has no transitive dependencies, and keeps serverless cold starts small.
 */
export async function getAccessToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt) return cached.token;

  const key = await loadKey();
  const now = Math.floor(Date.now() / 1000);

  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      iss: key.client_email,
      scope: SCOPE,
      aud: TOKEN_URI,
      iat: now,
      exp: now + 3600,
    }),
  );

  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  const signature = b64url(signer.sign(key.private_key));
  const assertion = `${header}.${payload}.${signature}`;

  const res = await fetch(TOKEN_URI, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!res.ok) {
    throw new Error(`GSC token exchange failed (${res.status}): ${await res.text()}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  // Refresh a minute early so a long request can't straddle expiry.
  cached = { token: json.access_token, expiresAt: Date.now() + (json.expires_in - 60) * 1000 };
  return cached.token;
}
