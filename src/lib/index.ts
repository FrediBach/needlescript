// Public library surface for Needlescript.
// Import from here to use the language engine as a standalone library.

export { run, tokenize, parse, designStats, applyLocks, makeRNG, makeNoise, suggest, ALIASES, BUILTIN_ARITY, FUNC_ARITY, ZERO_FUNCS, RESERVED, LIMITS, NeedlescriptError } from './engine.ts';
export type { RunResult, RunOptions, StitchEvent, EventType, DesignStats, ASTNode, ExprNode, Token, TokenType } from './engine.ts';

export { toDST } from './dst.ts';

export { svgToCode, convertShapes } from './svg-importer.ts';
export type { ConvertOptions, ConvertResult, ConvertReport } from './svg-importer.ts';
