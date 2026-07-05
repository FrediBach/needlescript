/**
 * src/book/lib/progress.ts
 *
 * Tracks chapter completion state in localStorage.
 * Keys are chapter ids (e.g. "ch-0-1").
 * A chapter is "done" when its Checkpoint is completed.
 */

const PREFIX = 'ns-book-progress:';

export function isChapterDone(id: string): boolean {
  try {
    return localStorage.getItem(PREFIX + id) === '1';
  } catch {
    return false;
  }
}

export function markChapterDone(id: string): void {
  try {
    localStorage.setItem(PREFIX + id, '1');
  } catch {
    // localStorage unavailable (private browsing, storage full) — silently ignore
  }
}

export function clearChapterProgress(id: string): void {
  try {
    localStorage.removeItem(PREFIX + id);
  } catch {
    // ignore
  }
}

export function getAllProgress(): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX)) {
        result[key.slice(PREFIX.length)] = localStorage.getItem(key) === '1';
      }
    }
  } catch {
    // ignore
  }
  return result;
}
