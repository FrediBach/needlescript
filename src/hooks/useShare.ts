import { useCallback, useEffect, useRef } from 'react';

type AddMsg = (
  text: string,
  type?: 'info' | 'ok' | 'err' | 'print' | 'warn' | 'time',
) => void;

interface UseShareOptions {
  source: string;
  setSource: (src: string) => void;
  runProgram: (src: string, name: string) => void;
  addMsg: AddMsg;
  /** Source code to fall back to when a share link fails (a stable constant). */
  fallbackSrc: string;
  /** Design name to use when falling back (a stable constant). */
  fallbackName: string;
}

/**
 * Handles the share-link feature:
 * - On mount, reads `?share=<binId>` from the URL and fetches the snippet.
 * - Exposes `handleShare` to POST the current source and copy the resulting URL.
 */
export function useShare({ source, setSource, runProgram, addMsg, fallbackSrc, fallbackName }: UseShareOptions) {
  const shareLoadedRef = useRef(false);

  useEffect(() => {
    if (shareLoadedRef.current) return;
    const params  = new URLSearchParams(window.location.search);
    const shareId = params.get('share');
    if (!shareId) return;
    shareLoadedRef.current = true;
    addMsg('loading shared snippet…', 'info');
    fetch(`/api/share?id=${encodeURIComponent(shareId)}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: { source: string }) => {
        setSource(data.source);
        runProgram(data.source, 'shared');
      })
      .catch(err => {
        addMsg(`could not load share: ${err instanceof Error ? err.message : err}`, 'err');
        runProgram(fallbackSrc, fallbackName);
      });
  }, [addMsg, setSource, runProgram, fallbackSrc, fallbackName]);

  const handleShare = useCallback(async (): Promise<void> => {
    const res = await fetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
    }
    const { id } = await res.json() as { id: string };
    const url = `${window.location.origin}/?share=${id}`;
    await navigator.clipboard.writeText(url);
  }, [source]);

  return { handleShare };
}
