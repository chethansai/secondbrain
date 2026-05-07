const http = require('http');
const { URL } = require('url');

const port = Number(process.env.AI_PROXY_PORT || 8787);
const defaultTarget = process.env.AI_PROXY_TARGET || 'https://chethan.tailb6229f.ts.net/v1/responses';

const server = http.createServer(async (request, response) => {
  setCorsHeaders(request, response);

  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method !== 'POST') {
    response.writeHead(405, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'Only POST is supported.' }));
    return;
  }

  try {
    const requestUrl = new URL(request.url || '/', `http://localhost:${port}`);
    const target = requestUrl.searchParams.get('target') || defaultTarget;
    if (!isAllowedTarget(target)) {
      response.writeHead(403, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Target is not allowed.' }));
      return;
    }

    const body = await readBody(request);
    const upstream = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: request.headers.authorization || 'Bearer dummy',
      },
      body,
    });

    response.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('content-type') || 'text/plain; charset=utf-8',
      'Cache-Control': upstream.headers.get('cache-control') || 'no-cache',
    });

    if (upstream.body) {
      for await (const chunk of upstream.body) response.write(chunk);
    } else {
      response.write(await upstream.text());
    }
    response.end();
  } catch (error) {
    response.writeHead(502, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Proxy request failed.' }));
  }
});

server.listen(port, () => {
  console.log(`AI CORS proxy listening on http://localhost:${port}`);
});

function setCorsHeaders(request, response) {
  response.setHeader('Access-Control-Allow-Origin', request.headers.origin || '*');
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function isAllowedTarget(value) {
  try {
    const targetUrl = new URL(value);
    return targetUrl.protocol === 'https:' && targetUrl.hostname.endsWith('.ts.net');
  } catch {
    return false;
  }
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('error', reject);
    request.on('end', () => resolve(Buffer.concat(chunks)));
  });
}