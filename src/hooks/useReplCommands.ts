import { useState, useCallback } from 'react';
import type { ConsoleMessage } from '../App.tsx';

// ─── Storage ──────────────────────────────────────────────────────────────────

const NS_SNIPPETS_KEY = 'ns-snippets';

export interface SavedSnippet {
  code: string;
  savedAt: number; // Unix ms
}

export type SnippetMap = Record<string, SavedSnippet>;

function loadSnippets(): SnippetMap {
  try {
    const raw = localStorage.getItem(NS_SNIPPETS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return parsed as SnippetMap;
  } catch {
    return {};
  }
}

function persistSnippets(map: SnippetMap): void {
  localStorage.setItem(NS_SNIPPETS_KEY, JSON.stringify(map));
}

// ─── Random name generation ───────────────────────────────────────────────────

const WORDS_A = [
  'amber',
  'ash',
  'bare',
  'bold',
  'calm',
  'clay',
  'cool',
  'dark',
  'deep',
  'dense',
  'deft',
  'dim',
  'dry',
  'dusty',
  'even',
  'fast',
  'fine',
  'firm',
  'flat',
  'free',
  'gold',
  'gray',
  'hard',
  'hazy',
  'high',
  'jade',
  'keen',
  'long',
  'loose',
  'mild',
  'mint',
  'misty',
  'neat',
  'pale',
  'pine',
  'plain',
  'rare',
  'rich',
  'rose',
  'rust',
  'sage',
  'sand',
  'sharp',
  'silk',
  'slim',
  'slow',
  'soft',
  'still',
  'swift',
  'tall',
  'thin',
  'tidy',
  'tiny',
  'trim',
  'warm',
  'wide',
  'wild',
];
const WORDS_B = [
  'arc',
  'bead',
  'bloom',
  'braid',
  'branch',
  'cell',
  'chain',
  'coil',
  'curl',
  'dart',
  'draft',
  'drift',
  'echo',
  'edge',
  'fan',
  'fern',
  'field',
  'fill',
  'float',
  'fold',
  'frame',
  'grain',
  'grid',
  'grove',
  'hatch',
  'hem',
  'iris',
  'knot',
  'lace',
  'leaf',
  'loop',
  'mesh',
  'motif',
  'node',
  'patch',
  'path',
  'petal',
  'reef',
  'ring',
  'row',
  'run',
  'shell',
  'skein',
  'spool',
  'strand',
  'sweep',
  'swirl',
  'thread',
  'tile',
  'trace',
  'twist',
  'wave',
  'weave',
  'whirl',
  'whorl',
  'wrap',
  'wreath',
];

function randomName(existing: SnippetMap): string {
  // Try up to 10 times to get a unique name
  for (let i = 0; i < 10; i++) {
    const a = WORDS_A[Math.floor(Math.random() * WORDS_A.length)];
    const b = WORDS_B[Math.floor(Math.random() * WORDS_B.length)];
    const name = `${a}-${b}`;
    if (!(name in existing)) return name;
  }
  // Fallback: append a short timestamp suffix
  return `sketch-${Date.now().toString(36).slice(-4)}`;
}

// ─── Fuzzy snippet lookup ─────────────────────────────────────────────────────

function findSnippet(map: SnippetMap, query: string): string | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const names = Object.keys(map);
  // Exact match
  if (q in map) return q;
  // Starts-with
  const sw = names.find((n) => n.toLowerCase().startsWith(q));
  if (sw) return sw;
  // Contains
  const cnt = names.find((n) => n.toLowerCase().includes(q));
  if (cnt) return cnt;
  return null;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

type AddMsg = (text: string, type?: ConsoleMessage['type']) => void;

interface UseReplCommandsOptions {
  sourceRef: React.RefObject<string>;
  setSource: (src: string) => void;
  runProgram: (src: string, name: string) => Promise<void>;
  addMsg: AddMsg;
  handleShare: () => Promise<void>;
}

export interface UseReplCommandsReturn {
  /** Dispatch a slash command such as "/share", "/save name", "/load name". */
  handleReplCommand: (line: string) => Promise<void>;
  /** Sorted list of saved snippet names — drives autocomplete. */
  savedSnippetNames: string[];
}

export function useReplCommands({
  sourceRef,
  setSource,
  runProgram,
  addMsg,
  handleShare,
}: UseReplCommandsOptions): UseReplCommandsReturn {
  const [snippets, setSnippets] = useState<SnippetMap>(loadSnippets);

  const updateSnippets = useCallback((next: SnippetMap) => {
    persistSnippets(next);
    setSnippets(next);
  }, []);

  // ── /share ────────────────────────────────────────────────────────
  const doShare = useCallback(async () => {
    try {
      await handleShare();
      addMsg('share link copied to clipboard', 'ok');
    } catch (err) {
      addMsg(`share failed: ${err instanceof Error ? err.message : String(err)}`, 'err');
    }
  }, [handleShare, addMsg]);

  // ── /save [name] ──────────────────────────────────────────────────
  const doSave = useCallback(
    (arg: string) => {
      const current = loadSnippets(); // read fresh to avoid stale state
      const name = arg.trim() || randomName(current);
      const isUpdate = name in current;
      const next = { ...current, [name]: { code: sourceRef.current, savedAt: Date.now() } };
      updateSnippets(next);
      addMsg(isUpdate ? `updated "${name}"` : `saved as "${name}"`, 'ok');
    },
    [sourceRef, updateSnippets, addMsg],
  );

  // ── /load [name] ──────────────────────────────────────────────────
  const doLoad = useCallback(
    async (arg: string) => {
      const current = loadSnippets();
      const names = Object.keys(current);

      if (!arg.trim()) {
        if (names.length === 0) {
          addMsg('nothing saved yet — use /save <name> to save a snippet', 'info');
        } else {
          addMsg(`saved snippets (${names.length}):`, 'info');
          names
            .sort()
            .forEach((n) =>
              addMsg(`  ${n}  ·  ${new Date(current[n].savedAt).toLocaleDateString()}`, 'info'),
            );
        }
        return;
      }

      const match = findSnippet(current, arg.trim());
      if (!match) {
        addMsg(`no snippet matching "${arg.trim()}"`, 'err');
        return;
      }

      const snippet = current[match];
      setSource(snippet.code);
      await runProgram(snippet.code, match);
      addMsg(`loaded "${match}"`, 'ok');
    },
    [setSource, runProgram, addMsg],
  );

  // ── /remove <name> ────────────────────────────────────────────────
  const doRemove = useCallback(
    (arg: string) => {
      if (!arg.trim()) {
        addMsg('usage: /remove <name>', 'err');
        return;
      }
      const current = loadSnippets();
      const match = findSnippet(current, arg.trim());
      if (!match) {
        addMsg(`no snippet matching "${arg.trim()}"`, 'err');
        return;
      }
      const next = { ...current };
      delete next[match];
      updateSnippets(next);
      addMsg(`removed "${match}"`, 'ok');
    },
    [updateSnippets, addMsg],
  );

  // ── Main dispatcher ───────────────────────────────────────────────
  const handleReplCommand = useCallback(
    async (line: string): Promise<void> => {
      const trimmed = line.trim();
      const spaceIdx = trimmed.indexOf(' ');
      const verb = (spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)).toLowerCase();
      const arg = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1);

      switch (verb) {
        case '/share':
          await doShare();
          break;
        case '/save':
          doSave(arg);
          break;
        case '/load':
          await doLoad(arg);
          break;
        case '/remove':
          doRemove(arg);
          break;
        default:
          addMsg(`unknown command "${verb}" — try /save, /load, /remove, /share, /ai`, 'err');
      }
    },
    [doShare, doSave, doLoad, doRemove, addMsg],
  );

  const savedSnippetNames = Object.keys(snippets).sort();

  return { handleReplCommand, savedSnippetNames };
}
