// ============================================================================
//  Cloudflare Pages — Advanced Mode single-file Worker
// ----------------------------------------------------------------------------
//  This file (_worker.js at the site root) IS picked up by dashboard
//  drag-and-drop "Direct Upload" deployments, unlike the functions/ folder
//  which only compiles on Git builds / Wrangler.
//
//  Behaviour:
//    • /api/*  → proxied server-side to PocketBase (browser stays same-origin,
//                so CORS can never happen)
//    • everything else → served as a normal static file (index.html, images…)
// ============================================================================

const POCKETBASE_ORIGIN = 'https://pocketbase.serverkakoulabs.org';

// Paths that live in the project folder but must never be served. The whole
// directory gets uploaded as static assets, so server-side sources, database
// migrations, docs and local tooling config would otherwise be public — they
// were. Denying here rather than relying on an ignore file is deliberate:
// .assetsignore is a Workers feature and is NOT honoured by Pages, whereas this
// runs ahead of env.ASSETS on every request regardless of what got uploaded.
// 404 rather than 403 so the response doesn't confirm the path exists.
const BLOCKED_PATHS = [
  /^\/pb_hooks\//i,          // PocketBase cron/hook source
  /^\/pb_migrations\//i,     // database schema
  /^\/proxmox\//i,           // Proxmox/LXC helper scripts (community-scripts)
  /^\/docs\//i,              // specs and implementation plans
  /^\/\.claude\//i,          // local tooling config
  /^\/\.git\//i,
  /^\/\.env/i,
  /^\/_worker\.js$/i,
  /^\/index\.html\..+/i,     // index.html.bak-*, .prepalette-*, .prethemes-*
  /\.(bak|log|toml|md)$/i,
];

// Baseline security headers for served pages/assets. Kept conservative on
// purpose: a full script/style/connect CSP would have to enumerate every CDN,
// the PocketBase origin, hCaptcha, the weather + web3forms endpoints, and allow
// 'unsafe-inline' for the app's many inline scripts/handlers — easy to get wrong
// and break auth. So we ship the low-risk, high-value headers plus a CSP limited
// to frame-ancestors (clickjacking) which never affects resource loading.
function withSecurityHeaders(resp, pathname) {
  const headers = new Headers(resp.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), payment=(), usb=(), magnetometer=(), gyroscope=()');
  headers.set('Strict-Transport-Security', 'max-age=31536000');
  // Clickjacking protection — but NOT on the embeddable demo widget, which is
  // deliberately meant to be iframed on third-party sites.
  if (!/^\/demo-embed\.html$/i.test(pathname)) {
    headers.set('X-Frame-Options', 'SAMEORIGIN');
    headers.set('Content-Security-Policy', "frame-ancestors 'self'");
  }
  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ---- Deny non-public paths ------------------------------------------
    if (BLOCKED_PATHS.some((re) => re.test(url.pathname))) {
      return withSecurityHeaders(new Response('Not found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      }), url.pathname);
    }

    // ---- PocketBase API proxy -------------------------------------------
    if (url.pathname.startsWith('/api/')) {
      const target = POCKETBASE_ORIGIN + url.pathname + url.search;

      // Answer CORS preflight directly (same-origin won't send one, but be safe).
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': url.origin,
            'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
            'Access-Control-Allow-Headers':
              request.headers.get('Access-Control-Request-Headers') || 'Authorization,Content-Type',
            'Access-Control-Max-Age': '86400',
          },
        });
      }

      // Copy method, headers and body onto the PocketBase target URL.
      const proxied = new Request(target, request);
      const ip = request.headers.get('CF-Connecting-IP');
      if (ip) proxied.headers.set('X-Forwarded-For', ip);

      const resp = await fetch(proxied);
      const headers = new Headers(resp.headers);
      headers.set('Access-Control-Allow-Origin', url.origin);
      return new Response(resp.body, {
        status: resp.status,
        statusText: resp.statusText,
        headers,
      });
    }

    // ---- Static site (index.html, welcome-hero.png, …) ------------------
    return withSecurityHeaders(await env.ASSETS.fetch(request), url.pathname);
  },
};
