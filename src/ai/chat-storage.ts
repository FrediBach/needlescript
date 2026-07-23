import type { AiChatThread } from './chat-types.ts';

const STORAGE_KEY = 'ns-ai-chat-threads-v1';
const DATABASE_NAME = 'needlescript-ai';
const STORE_NAME = 'chat-state';
const MAX_THREADS_PER_WORKSPACE = 20;
const MAX_COMPLETED_TURNS = 200;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const SOFT_SIZE_LIMIT = 5_000_000;

interface StoredThreads {
  version: 1;
  threads: AiChatThread[];
}

/**
 * Normalize only the current persisted shape.
 *
 * Version-one threads created before explicit intents are interpreted as edit threads once they
 * contain turns. Empty legacy threads keep their missing intent so the caller can choose one.
 */
function normalizeStoredThreads(threads: unknown[]): AiChatThread[] {
  return threads.flatMap((value) => {
    const thread = value as AiChatThread | undefined;
    if (thread?.version !== 1) return [];
    return [
      thread.intent || thread.turns.length === 0 ? thread : { ...thread, intent: 'edit' as const },
    ];
  });
}

function protectedThread(thread: AiChatThread): boolean {
  // Never evict work that still requires a user decision or could contain an unapplied proposal.
  return Boolean(
    thread.pendingQuestionSet ||
    thread.draft?.status === 'changed' ||
    thread.draft?.status === 'stale' ||
    thread.activePlan?.steps.some(({ status }) => status !== 'completed'),
  );
}

export function retainChatThreads(
  threads: readonly AiChatThread[],
  now = Date.now(),
): AiChatThread[] {
  /*
   * Retention is newest-first and applies age, per-workspace, completed-turn, and approximate-size
   * limits together. Protected threads bypass those limits, favoring recoverability of in-progress
   * work over a strict storage cap.
   */
  const retained: AiChatThread[] = [];
  const workspaceCounts = new Map<string, number>();
  let completedTurns = 0;
  let bytes = 0;
  for (const thread of [...threads].sort((left, right) => right.updatedAt - left.updatedAt)) {
    const keepRegardless = protectedThread(thread);
    const workspaceCount = workspaceCounts.get(thread.workspaceId) ?? 0;
    const threadCompletedTurns = thread.turns.filter(({ status }) => status === 'completed').length;
    const serializedBytes = JSON.stringify(thread).length;
    if (
      !keepRegardless &&
      (now - thread.updatedAt > MAX_AGE_MS ||
        workspaceCount >= MAX_THREADS_PER_WORKSPACE ||
        completedTurns + threadCompletedTurns > MAX_COMPLETED_TURNS ||
        bytes + serializedBytes > SOFT_SIZE_LIMIT)
    ) {
      continue;
    }
    retained.push(thread);
    workspaceCounts.set(thread.workspaceId, workspaceCount + 1);
    completedTurns += threadCompletedTurns;
    bytes += serializedBytes;
  }
  return retained;
}

export function loadChatThreads(): AiChatThread[] {
  if (typeof indexedDB !== 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || (parsed as { version?: unknown }).version !== 1)
      return [];
    const threads = (parsed as StoredThreads).threads;
    return Array.isArray(threads) ? normalizeStoredThreads(threads) : [];
  } catch {
    return [];
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open AI chat storage.'));
  });
}

export async function loadChatThreadsAsync(): Promise<AiChatThread[]> {
  if (typeof indexedDB === 'undefined') return loadChatThreads();
  try {
    const database = await openDatabase();
    const value = await new Promise<StoredThreads | undefined>((resolve, reject) => {
      const request = database
        .transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME)
        .get('threads');
      request.onsuccess = () => resolve(request.result as StoredThreads | undefined);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return value?.version === 1 && Array.isArray(value.threads)
      ? normalizeStoredThreads(value.threads)
      : [];
  } catch {
    return [];
  }
}

export function saveChatThreads(threads: readonly AiChatThread[]): void {
  const retained = retainChatThreads(threads);
  const value: StoredThreads = { version: 1, threads: retained };
  if (typeof indexedDB !== 'undefined') {
    void openDatabase()
      .then(
        (database) =>
          new Promise<void>((resolve, reject) => {
            const transaction = database.transaction(STORE_NAME, 'readwrite');
            transaction.objectStore(STORE_NAME).put(value, 'threads');
            transaction.oncomplete = () => {
              database.close();
              resolve();
            };
            transaction.onerror = () => reject(transaction.error);
          }),
      )
      .catch(() => undefined);
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Persistence is best-effort; an in-memory chat must remain usable.
  }
}

export function deleteAllChatThreads(): void {
  if (typeof indexedDB !== 'undefined') {
    void openDatabase().then((database) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete('threads');
      transaction.oncomplete = () => database.close();
    });
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}
