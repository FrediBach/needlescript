import { describe, it, expect } from 'vitest';
import { tokenize, NeedlescriptError } from '../engine.ts';
import type { Token } from '../engine.ts';

// Helper: extract just the token kinds and values for compact assertions
const tv = (tokens: Token[]) => tokens.map(t => ({ t: t.t, v: t.v }));

describe('tokenize', () => {
  // ── numbers ────────────────────────────────────────────────────────────────
  describe('numbers', () => {
    it('tokenizes a plain integer', () => {
      expect(tv(tokenize('42'))).toEqual([{ t: 'num', v: 42 }]);
    });

    it('tokenizes a decimal', () => {
      expect(tv(tokenize('3.14'))).toEqual([{ t: 'num', v: 3.14 }]);
    });

    it('tokenizes a leading-dot decimal', () => {
      expect(tv(tokenize('.5'))).toEqual([{ t: 'num', v: 0.5 }]);
    });

    it('tokenizes multiple numbers separated by whitespace', () => {
      const toks = tv(tokenize('10 20 30'));
      expect(toks).toEqual([
        { t: 'num', v: 10 },
        { t: 'num', v: 20 },
        { t: 'num', v: 30 },
      ]);
    });

    it('throws on a malformed number', () => {
      // A lone dot followed by a non-digit is not a number start, so '.' is an unexpected char
      expect(() => tokenize('.')).toThrow(NeedlescriptError);
    });
  });

  // ── words ──────────────────────────────────────────────────────────────────
  describe('words', () => {
    it('tokenizes a single word, lowercased', () => {
      expect(tv(tokenize('FD'))).toEqual([{ t: 'word', v: 'fd' }]);
    });

    it('tokenizes multiple words', () => {
      expect(tv(tokenize('fd bk rt lt'))).toEqual([
        { t: 'word', v: 'fd' },
        { t: 'word', v: 'bk' },
        { t: 'word', v: 'rt' },
        { t: 'word', v: 'lt' },
      ]);
    });

    it('allows underscores and dots in words', () => {
      expect(tv(tokenize('my_proc'))).toEqual([{ t: 'word', v: 'my_proc' }]);
    });
  });

  // ── variables ──────────────────────────────────────────────────────────────
  describe('variables (:name)', () => {
    it('tokenizes :name as a var token', () => {
      expect(tv(tokenize(':size'))).toEqual([{ t: 'var', v: 'size' }]);
    });

    it('lowercases variable names', () => {
      expect(tv(tokenize(':MyVar'))).toEqual([{ t: 'var', v: 'myvar' }]);
    });

    it('throws on bare colon with no name', () => {
      expect(() => tokenize(': ')).toThrow(NeedlescriptError);
    });
  });

  // ── quoted words ───────────────────────────────────────────────────────────
  describe('quoted words ("name)', () => {
    it('tokenizes "name as qword', () => {
      expect(tv(tokenize('"size'))).toEqual([{ t: 'qword', v: 'size' }]);
    });

    it('lowercases quoted words', () => {
      expect(tv(tokenize('"MyVar'))).toEqual([{ t: 'qword', v: 'myvar' }]);
    });

    it('throws on bare quote with no name', () => {
      expect(() => tokenize('" ')).toThrow(NeedlescriptError);
    });
  });

  // ── operators ─────────────────────────────────────────────────────────────
  describe('operators', () => {
    it('tokenizes all operators', () => {
      const ops = tv(tokenize('+ - * / < > ='));
      expect(ops.map(t => t.v)).toEqual(['+', '-', '*', '/', '<', '>', '=']);
      expect(ops.every(t => t.t === 'op')).toBe(true);
    });

    it('records spBefore/spAfter on operators', () => {
      // "40 - 40": the minus has a space before it
      const [, minus] = tokenize('40 - 40');
      expect(minus.spBefore).toBe(true);
      // "- 40" → space after (the next char is a space), so spAfter is true
      // (spAfter: i+1 >= length OR /\s/ — here it is a space)
      expect(minus.spAfter).toBe(true);
    });

    it('marks Logo-style negative literal: "-5" — spBefore=true, spAfter=false', () => {
      // "fd -5": the minus is preceded by space and glued to the digit
      const toks = tokenize('fd -5');
      const minus = toks.find(t => t.t === 'op' && t.v === '-')!;
      expect(minus.spBefore).toBe(true);
      expect(minus.spAfter).toBe(false);
    });
  });

  // ── brackets ──────────────────────────────────────────────────────────────
  describe('brackets and parentheses', () => {
    it('tokenizes [ ] ( ) as their own token types', () => {
      const toks = tv(tokenize('[ ] ( )'));
      expect(toks).toEqual([
        { t: '[', v: undefined },
        { t: ']', v: undefined },
        { t: '(', v: undefined },
        { t: ')', v: undefined },
      ]);
    });
  });

  // ── comments ──────────────────────────────────────────────────────────────
  describe('comments', () => {
    it('strips ; to end of line', () => {
      expect(tv(tokenize('fd 10 ; this is ignored\nbk 5'))).toEqual([
        { t: 'word', v: 'fd' },
        { t: 'num', v: 10 },
        { t: 'word', v: 'bk' },
        { t: 'num', v: 5 },
      ]);
    });

    it('handles a comment-only line', () => {
      expect(tokenize('; just a comment\n')).toEqual([]);
    });
  });

  // ── whitespace & newlines ──────────────────────────────────────────────────
  describe('whitespace', () => {
    it('tracks line numbers across newlines', () => {
      const toks = tokenize('fd 1\nbk 2\nrt 3');
      expect(toks[0].line).toBe(1); // fd
      expect(toks[2].line).toBe(2); // bk
      expect(toks[4].line).toBe(3); // rt
    });

    it('handles tabs and multiple spaces', () => {
      expect(tv(tokenize('\t\t  fd\t10  '))).toEqual([
        { t: 'word', v: 'fd' },
        { t: 'num', v: 10 },
      ]);
    });
  });

  // ── error cases ────────────────────────────────────────────────────────────
  describe('errors', () => {
    it('throws NeedlescriptError on unexpected character', () => {
      expect(() => tokenize('fd @10')).toThrow(NeedlescriptError);
    });

    it('error message includes the bad character', () => {
      let msg = '';
      try { tokenize('$'); } catch (e) { msg = (e as Error).message; }
      expect(msg).toContain('$');
    });

    it('error includes line number', () => {
      let line: number | undefined;
      try { tokenize('fd 1\n$'); } catch (e) { line = (e as NeedlescriptError).slLine; }
      expect(line).toBe(2);
    });

    it('empty source produces empty token array', () => {
      expect(tokenize('')).toEqual([]);
      expect(tokenize('   \n\n  ')).toEqual([]);
    });
  });

  // ── realistic programs ─────────────────────────────────────────────────────
  describe('realistic programs', () => {
    it('tokenizes "repeat 4 [ fd 10 rt 90 ]" correctly', () => {
      const toks = tv(tokenize('repeat 4 [ fd 10 rt 90 ]'));
      expect(toks).toEqual([
        { t: 'word', v: 'repeat' }, { t: 'num', v: 4 },
        { t: '[', v: undefined },
        { t: 'word', v: 'fd' }, { t: 'num', v: 10 },
        { t: 'word', v: 'rt' }, { t: 'num', v: 90 },
        { t: ']', v: undefined },
      ]);
    });

    it('tokenizes a procedure definition', () => {
      const src = 'to square :s\n  repeat 4 [ fd :s rt 90 ]\nend';
      const toks = tv(tokenize(src));
      expect(toks[0]).toEqual({ t: 'word', v: 'to' });
      expect(toks[1]).toEqual({ t: 'word', v: 'square' });
      expect(toks[2]).toEqual({ t: 'var', v: 's' });
      expect(toks[toks.length - 1]).toEqual({ t: 'word', v: 'end' });
    });

    it('tokenizes make "x 10', () => {
      const toks = tv(tokenize('make "x 10'));
      expect(toks).toEqual([
        { t: 'word', v: 'make' },
        { t: 'qword', v: 'x' },
        { t: 'num', v: 10 },
      ]);
    });
  });
});
