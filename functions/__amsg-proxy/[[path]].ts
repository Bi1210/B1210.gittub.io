const UPSTREAM = 'https://sullyos-amsg.2693082147.workers.dev';

const cors = (request: Request) => ({
  'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Max-Age': '86400',
});

export const onRequest = async (context: { request: Request; params: Record<string, string | string[]> }) => {
  const { request, params } = context;
  const headers = cors(request);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

  const requestPath = new URL(request.url).pathname.replace(/^\/__amsg-proxy\/?/, '').replace(/\/+$/, '');
  const pathFromParams = Array.isArray(params.path) ? params.path.join('/') : (params.path || '');
  const path = requestPath || pathFromParams;
  // The deployed legacy worker misroutes init-tenant into schedule validation.
  // D1 is already initialized; let the client continue to the real key check.
  if (path === 'init-tenant' && request.method === 'POST') {
    return new Response(JSON.stringify({ success: true, data: { schema: { compatible: true, skipped: true } } }), {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }
  const upstream = `${UPSTREAM}/${path}${new URL(request.url).search}`;
  const forward = new Headers(request.headers);
  forward.delete('host');
  forward.delete('origin');
  forward.delete('referer');
  forward.delete('content-length');

  let body: ArrayBuffer | undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const raw = await request.arrayBuffer();
    if (raw.byteLength > 0) body = raw;
    else if (path === 'init-tenant') {
      body = new TextEncoder().encode('{"contactName":"SullyOS"}').buffer;
      forward.set('content-type', 'application/json');
    }
  }
  const response = await fetch(upstream, {
    method: request.method,
    headers: forward,
    body: body && body.byteLength > 0 ? body : undefined,
  });
  const out = new Headers(response.headers);
  Object.entries(headers).forEach(([key, value]) => out.set(key, value));
  out.delete('content-encoding');
  out.delete('content-length');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: out });
};
