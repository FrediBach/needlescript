import { describe, it, expect } from 'vitest';
import { tokenize, parse, NeedlescriptError } from '../engine.ts';
import type { ASTNode, ExprNode } from '../engine.ts';

// Helper: parse source directly
const p = (src: string) => parse(tokenize(src));

// Helper: first statement
const first = (src: string) => p(src)[0];

describe('parse', () => {
  // ── procedure definitions ──────────────────────────────────────────────────
  describe('procedure definitions (to … end)', () => {
    it('parses a zero-parameter procedure', () => {
      const node = first('to sq\n  fd 10\nend');
      expect(node.k).toBe('to');
      if (node.k === 'to') {
        expect(node.name).toBe('sq');
        expect(node.params).toEqual([]);
        expect(node.body).toHaveLength(1);
      }
    });

    it('parses a procedure with parameters', () => {
      const node = first('to square :size\n  fd :size\nend');
      if (node.k === 'to') {
        expect(node.params).toEqual(['size']);
      }
    });

    it('parses a procedure with multiple parameters', () => {
      const node = first('to move :x :y\n  setxy :x :y\nend');
      if (node.k === 'to') {
        expect(node.params).toEqual(['x', 'y']);
      }
    });

    it('throws when "to" has no name', () => {
      expect(() => p('to\nfd 10\nend')).toThrow(NeedlescriptError);
    });

    it('throws when "end" is missing', () => {
      expect(() => p('to sq\n  fd 10')).toThrow(NeedlescriptError);
    });

    it('throws when redefining a built-in', () => {
      expect(() => p('to fd :n\nend')).toThrow(NeedlescriptError);
    });

    it('throws when redefining repeat', () => {
      expect(() => p('to repeat\nend')).toThrow(NeedlescriptError);
    });
  });

  // ── repeat ─────────────────────────────────────────────────────────────────
  describe('repeat', () => {
    it('parses repeat with a block', () => {
      const node = first('repeat 4 [ fd 10 ]');
      expect(node.k).toBe('repeat');
      if (node.k === 'repeat') {
        expect(node.count).toEqual({ k: 'num', v: 4 });
        expect(node.body).toHaveLength(1);
      }
    });

    it('parses nested repeats', () => {
      const node = first('repeat 3 [ repeat 4 [ fd 5 ] ]');
      expect(node.k).toBe('repeat');
      if (node.k === 'repeat') {
        expect(node.body[0].k).toBe('repeat');
      }
    });

    it('throws on missing [', () => {
      expect(() => p('repeat 4 fd 10')).toThrow(NeedlescriptError);
    });

    it('throws on missing ]', () => {
      expect(() => p('repeat 4 [ fd 10')).toThrow(NeedlescriptError);
    });
  });

  // ── if / else ──────────────────────────────────────────────────────────────
  describe('if / else', () => {
    it('parses if without else', () => {
      const node = first('if 1 [ fd 10 ]');
      expect(node.k).toBe('if');
      if (node.k === 'if') {
        expect(node.elseBody).toBeNull();
        expect(node.body).toHaveLength(1);
      }
    });

    it('parses if with else', () => {
      const node = first('if :x > 0 [ fd :x ] else [ bk :x ]');
      expect(node.k).toBe('if');
      if (node.k === 'if') {
        expect(node.elseBody).not.toBeNull();
        expect(node.elseBody).toHaveLength(1);
      }
    });
  });

  // ── make ───────────────────────────────────────────────────────────────────
  describe('make', () => {
    it('parses make "name expr', () => {
      const node = first('make "size 10');
      expect(node.k).toBe('make');
      if (node.k === 'make') {
        expect(node.name).toBe('size');
        expect(node.value).toEqual({ k: 'num', v: 10 });
      }
    });

    it('throws when make has no quoted name', () => {
      expect(() => p('make size 10')).toThrow(NeedlescriptError);
    });
  });

  // ── built-in commands ──────────────────────────────────────────────────────
  describe('built-in commands', () => {
    it('parses fd with one argument', () => {
      const node = first('fd 10');
      expect(node.k).toBe('cmd');
      if (node.k === 'cmd') {
        expect(node.name).toBe('fd');
        expect(node.args).toHaveLength(1);
        expect(node.args[0]).toEqual({ k: 'num', v: 10 });
      }
    });

    it('parses aliases: forward → fd', () => {
      const node = first('forward 10');
      expect(node.k).toBe('cmd');
      if (node.k === 'cmd') expect(node.name).toBe('fd');
    });

    it('parses aliases: penup → up', () => {
      const node = first('penup');
      if (node.k === 'cmd') expect(node.name).toBe('up');
    });

    it('parses setxy with two arguments', () => {
      const node = first('setxy 5 -10');
      expect(node.k).toBe('cmd');
      if (node.k === 'cmd') {
        expect(node.name).toBe('setxy');
        expect(node.args).toHaveLength(2);
      }
    });

    it('parses zero-argument commands', () => {
      for (const cmd of ['up', 'down', 'home', 'cs', 'stop', 'trim', 'beginfill', 'endfill']) {
        const node = first(cmd);
        expect(node.k).toBe('cmd');
        if (node.k === 'cmd') {
          expect(node.args).toHaveLength(0);
        }
      }
    });

    it('throws on unknown command', () => {
      expect(() => p('unknown_command')).toThrow(NeedlescriptError);
    });
  });

  // ── procedure calls ────────────────────────────────────────────────────────
  describe('procedure calls', () => {
    it('parses a call to a user-defined procedure with correct arity', () => {
      const nodes = p('to leaf :s\n  fd :s\nend\nleaf 5');
      expect(nodes).toHaveLength(2);
      const call = nodes[1];
      expect(call.k).toBe('call');
      if (call.k === 'call') {
        expect(call.name).toBe('leaf');
        expect(call.args).toHaveLength(1);
      }
    });
  });

  // ── expressions ───────────────────────────────────────────────────────────
  describe('expressions', () => {
    it('parses a numeric literal', () => {
      const node = first('fd 42');
      if (node.k === 'cmd') expect(node.args[0]).toEqual({ k: 'num', v: 42 });
    });

    it('parses a variable reference', () => {
      const node = first('fd :n');
      if (node.k === 'cmd') {
        const arg = node.args[0] as ExprNode;
        expect(arg.k).toBe('var');
      }
    });

    it('parses addition', () => {
      const node = first('fd 2 + 3');
      if (node.k === 'cmd') {
        expect(node.args[0].k).toBe('bin');
      }
    });

    it('parses multiplication with higher precedence than addition', () => {
      const node = first('fd 2 + 3 * 4');
      if (node.k === 'cmd') {
        const expr = node.args[0] as Extract<ExprNode, { k: 'bin' }>;
        expect(expr.k).toBe('bin');
        expect(expr.op).toBe('+');
        expect(expr.right.k).toBe('bin');
        if (expr.right.k === 'bin') expect(expr.right.op).toBe('*');
      }
    });

    it('parses parenthesised expression', () => {
      const node = first('fd ( 2 + 3 ) * 4');
      if (node.k === 'cmd') {
        const expr = node.args[0] as Extract<ExprNode, { k: 'bin' }>;
        expect(expr.op).toBe('*');
        expect(expr.left.k).toBe('bin');
      }
    });

    it('parses unary negation', () => {
      const node = first('fd -5');
      if (node.k === 'cmd') {
        expect(node.args[0].k).toBe('neg');
      }
    });

    it('parses Logo-style negative literal in multi-arg position', () => {
      // setxy 10 -20: the -20 should be a negative num, not subtraction
      const node = first('setxy 10 -20');
      if (node.k === 'cmd') {
        expect(node.args[1].k).toBe('neg');
      }
    });

    it('parses comparison operators', () => {
      const node = first('if :x > 0 [ fd 1 ]');
      if (node.k === 'if') {
        expect(node.cond.k).toBe('bin');
        if (node.cond.k === 'bin') expect(node.cond.op).toBe('>');
      }
    });

    it('parses unary function calls in expressions', () => {
      for (const fn of ['sin 45', 'cos 90', 'sqrt 16', 'log 10', 'abs -3', 'round 3.7']) {
        const node = first(`fd ${fn}`);
        if (node.k === 'cmd') {
          expect(node.args[0].k).toBe('func');
        }
      }
    });

    it('parses mod with two args', () => {
      const node = first('fd mod 10 3');
      if (node.k === 'cmd') {
        const expr = node.args[0] as Extract<ExprNode, { k: 'func' }>;
        expect(expr.name).toBe('mod');
        expect(expr.args).toHaveLength(2);
      }
    });

    it('parses zero-arg funcs: xcor, ycor, heading, repcount', () => {
      for (const fn of ['xcor', 'ycor', 'heading', 'repcount']) {
        const node = first(`fd ${fn}`);
        if (node.k === 'cmd') {
          const expr = node.args[0] as Extract<ExprNode, { k: 'func' }>;
          expect(expr.k).toBe('func');
          expect(expr.name).toBe(fn);
          expect(expr.args).toHaveLength(0);
        }
      }
    });

    it('parses random with one arg', () => {
      const node = first('fd random 10');
      if (node.k === 'cmd') {
        const expr = node.args[0] as Extract<ExprNode, { k: 'func' }>;
        expect(expr.name).toBe('random');
        expect(expr.args).toHaveLength(1);
      }
    });

    it('throws on missing value at end of program', () => {
      expect(() => p('fd')).toThrow(NeedlescriptError);
    });

    it('throws on missing closing paren', () => {
      expect(() => p('fd ( 1 + 2')).toThrow(NeedlescriptError);
    });
  });

  // ── multi-statement programs ───────────────────────────────────────────────
  describe('multi-statement programs', () => {
    it('parses multiple top-level statements', () => {
      const nodes = p('fd 10\nrt 90\nbk 10');
      expect(nodes).toHaveLength(3);
    });

    it('parses the bloom example without error', () => {
      const src = `stitchlen 2.2\nrepeat 12 [\n  repeat 36 [ fd 3.4 rt 10 ]\n  rt 30\n]`;
      expect(() => p(src)).not.toThrow();
    });

    it('parses the tree recursion example without error', () => {
      const src = [
        'to branch :len',
        '  if :len < 5 [ fd :len bk :len ]',
        '  else [',
        '    fd :len / 2',
        '    lt 28 branch :len * 0.62 rt 28',
        '    fd :len / 4',
        '    bk :len',
        '  ]',
        'end',
        'up setxy 0 -27 down',
        'branch 34',
      ].join('\n');
      expect(() => p(src)).not.toThrow();
    });
  });

  // ── line numbers ───────────────────────────────────────────────────────────
  describe('line numbers', () => {
    it('attaches the correct line number to statement nodes', () => {
      const nodes = p('fd 10\nrt 90');
      expect((nodes[0] as ASTNode & { line: number }).line).toBe(1);
      expect((nodes[1] as ASTNode & { line: number }).line).toBe(2);
    });
  });
});
