import { NextResponse, type NextRequest } from 'next/server';

/**
 * The auth Vercel will not sell us on this plan.
 *
 * Deployment protection covers preview and generated deployment URLs under
 * Standard Protection but deliberately excludes production domains, and the
 * mode that includes them ("All Deployments") is paid. So production sat open:
 * `POST /api/generate` took anonymous requests, which with a provider key
 * present means anyone who finds the URL can spend the account's credits.
 *
 * Two doors, because two kinds of caller need in:
 *
 * - **People** get HTTP Basic. A browser prompts natively, so there is no login
 *   page, no session table and no cookie to get wrong. The whole surface is one
 *   shared password for an internal tool used by a handful of people.
 * - **Vercel Cron** gets a bearer token. Vercel sends
 *   `Authorization: Bearer $CRON_SECRET` on scheduled invocations whenever that
 *   variable is defined, which is the documented mechanism and the only one an
 *   attacker cannot imitate. A `x-vercel-cron` header would be trivial to forge.
 *
 * Fails closed where it counts: on Vercel production with no password set,
 * everything is refused rather than quietly served. Locally an unset password
 * is allowed, so `next dev` needs no ceremony.
 */

const REALM = 'blogEO';

export function middleware(request: NextRequest): NextResponse {
  const isProduction = process.env.VERCEL_ENV === 'production';
  const authorization = request.headers.get('authorization');

  // Cron first. These routes are never reached by a person, and a scheduled
  // invocation cannot be prompted for a password.
  if (request.nextUrl.pathname.startsWith('/api/cron/')) {
    const secret = process.env.CRON_SECRET;
    if (!secret) return isProduction ? unconfigured('CRON_SECRET') : NextResponse.next();
    return authorization && safeEqual(authorization, `Bearer ${secret}`)
      ? NextResponse.next()
      : new NextResponse('Forbidden.', { status: 403 });
  }

  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return isProduction ? unconfigured('DASHBOARD_PASSWORD') : NextResponse.next();

  if (!authorization?.startsWith('Basic ')) return challenge();

  let decoded: string;
  try {
    decoded = atob(authorization.slice('Basic '.length));
  } catch {
    return challenge();
  }

  // Any username. There is one password and no user list to check it against,
  // so pretending otherwise would only invite someone to build one later.
  const supplied = decoded.slice(decoded.indexOf(':') + 1);
  return safeEqual(supplied, password) ? NextResponse.next() : challenge();
}

function challenge(): NextResponse {
  return new NextResponse('Authentication required.', {
    status: 401,
    headers: { 'www-authenticate': `Basic realm="${REALM}", charset="UTF-8"` },
  });
}

/**
 * A misconfigured production deployment is closed, not open. The message says
 * which variable is missing because the person reading it is the operator.
 */
function unconfigured(variable: string): NextResponse {
  return new NextResponse(`${variable} is not set on this deployment.`, { status: 503 });
}

/** Constant time within a length. The length itself is not worth hiding here. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const config = {
  // Everything except Next's own static output. Nothing this app serves is
  // public, so the default is protected and the exceptions are listed here
  // rather than the other way round.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
