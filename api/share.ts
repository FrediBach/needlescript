import type { VercelRequest, VercelResponse } from '@vercel/node';

// ── JSONBin.io config ──────────────────────────────────────────────────────
const JSONBIN_BASE = 'https://api.jsonbin.io/v3';
const MASTER_KEY = process.env.JSON_BIN_MASTER_KEY;
const API_KEY = process.env.JSON_BIN_API_KEY;
const COLLECTION_ID = process.env.JSON_BIN_COLLECTION_ID;

// ── Limits ─────────────────────────────────────────────────────────────────
const MAX_SOURCE_BYTES = 100_000; // 100 KB
const RATE_LIMIT_MAX = 10; // requests per window per IP
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// ── In-memory rate limiter ─────────────────────────────────────────────────
// Persists across warm Lambda invocations on the same instance.
// Resets on cold starts — acceptable for a low-traffic creative tool.
const rateLimitMap = new Map<string, number[]>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = (rateLimitMap.get(ip) ?? []).filter((t) => t > cutoff);
  if (timestamps.length >= RATE_LIMIT_MAX) return false;
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  return true;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function getClientIP(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress ?? 'unknown';
}

async function readBody(req: VercelRequest): Promise<unknown> {
  // Vercel automatically parses JSON bodies when Content-Type is application/json
  if (req.body !== undefined) return req.body;
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// ── POST /api/share ─────────────────────────────────────────────────────────
// Body: { source: string }
// Returns: { id: string }
async function handleCreate(req: VercelRequest, res: VercelResponse) {
  if (!API_KEY || !COLLECTION_ID || !MASTER_KEY) {
    return res.status(500).json({ error: 'Share service not configured' });
  }

  const ip = getClientIP(req);
  if (!checkRateLimit(ip)) {
    return res.status(429).json({
      error: `Rate limit exceeded — max ${RATE_LIMIT_MAX} shares per 15 minutes`,
    });
  }

  let body: unknown;
  try {
    body = await readBody(req);
  } catch {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    typeof (body as Record<string, unknown>).source !== 'string'
  ) {
    return res.status(400).json({ error: 'Body must be { source: string }' });
  }

  const source = (body as { source: string }).source;
  if (Buffer.byteLength(source, 'utf8') > MAX_SOURCE_BYTES) {
    return res.status(413).json({ error: 'Source too large (max 100 KB)' });
  }

  const jsonbinRes = await fetch(`${JSONBIN_BASE}/b`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Master-Key': MASTER_KEY,
      'X-Collection-Id': COLLECTION_ID,
      'X-Bin-Private': 'false',
    },
    body: JSON.stringify({ source }),
  });

  if (!jsonbinRes.ok) {
    const text = await jsonbinRes.text();
    console.error('JSONBin create error:', jsonbinRes.status, text);
    return res.status(502).json({ error: 'Failed to save share' });
  }

  const data = (await jsonbinRes.json()) as { metadata: { id: string } };
  return res.status(200).json({ id: data.metadata.id });
}

// ── GET /api/share?id=<binId> ───────────────────────────────────────────────
// Returns: { source: string }
async function handleRetrieve(req: VercelRequest, res: VercelResponse) {
  if (!API_KEY) {
    return res.status(500).json({ error: 'Share service not configured' });
  }

  const id = req.query.id;
  if (typeof id !== 'string' || !/^[a-f0-9]{24}$/.test(id)) {
    return res.status(400).json({ error: 'Invalid share id' });
  }

  const jsonbinRes = await fetch(`${JSONBIN_BASE}/b/${id}/latest`, {
    headers: { 'X-Master-Key': API_KEY },
  });

  if (jsonbinRes.status === 404) {
    return res.status(404).json({ error: 'Share not found' });
  }
  if (!jsonbinRes.ok) {
    const text = await jsonbinRes.text();
    console.error('JSONBin retrieve error:', jsonbinRes.status, text);
    return res.status(502).json({ error: 'Failed to retrieve share' });
  }

  const data = (await jsonbinRes.json()) as { record: { source: string } };
  if (typeof data.record?.source !== 'string') {
    return res.status(502).json({ error: 'Malformed share data' });
  }

  // Cache publicly for 1 year — bin contents are immutable once created
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  return res.status(200).json({ source: data.record.source });
}

// ── Router ──────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS for local Vite dev server
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'POST') return handleCreate(req, res);
  if (req.method === 'GET' && req.query.id) return handleRetrieve(req, res);

  return res.status(405).json({ error: 'Method not allowed' });
}
