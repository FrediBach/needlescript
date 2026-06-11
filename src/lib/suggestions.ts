// ---------- "Did you mean?" suggestions ----------

function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 3; // early out — we only care up to 2
  let prev = new Array<number>(n + 1);
  let cur = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

export function suggest(name: string, candidates: Iterable<string>): string | null {
  const maxD = name.length <= 3 ? 1 : 2;
  let best: string | null = null;
  let bestD = maxD + 1;
  for (const c of candidates) {
    if (c === name) continue;
    const d = editDistance(name, c);
    if (d < bestD) { bestD = d; best = c; }
  }
  return bestD <= maxD ? best : null;
}

export function didYouMean(name: string, candidates: Iterable<string>): string {
  const s = suggest(name, candidates);
  return s ? ` — did you mean "${s}"?` : '';
}
