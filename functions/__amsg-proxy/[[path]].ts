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

  const path = Array.isArray(params.path) ? params.path.join('/') : (params.path || '');
  const upstream = `${UPSTREAM}/${path}${new URL(request.url).search}`;
  const forward = new Headers(request.headers);
  forward.delete('host');
  forward.delete('origin');
  forward.delete('referer');

  const response = await fetch(upstream, {
    method: request.method,
    headers: forward,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer(),
  });
  const out = new Headers(response.headers);
  Object.entries(headers).forEach(([key, value]) => out.set(key, value));
  out.delete('content-encoding');
  out.delete('content-length');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: out });
};
