// ============================================================
// Needlescript core language engine
// Tokenizer, parser, stitch machine, fill engine, and interpreter.
// No DOM dependencies — usable as a standalone library.
//
// Units: millimetres. Heading: degrees, 0 = up/north, clockwise.
// ============================================================
//
// This file re-exports everything from the individual modules.
// See the individual files for implementation details:
//   types.ts        — shared types and interfaces
//   errors.ts       — NeedlescriptError
//   prng.ts         — makeRNG, makeNoise
//   commands.ts     — ALIASES, BUILTIN_ARITY, QWORD_BUILTINS, FABRICS, FUNC_ARITY, ZERO_FUNCS, LIST_FUNCS, LIST_CMDS, RESERVED
//   suggestions.ts  — suggest
//   tokenizer.ts    — tokenize
//   parser.ts       — parse
//   list.ts         — NsList and the list value helpers (RFC-2)
//   machine.ts      — LIMITS, Machine (internal stitch machine + fill engine)
//   postprocess.ts  — applyLocks, applyAutoTrim, densityMap, designStats
//   interpreter.ts  — run

export type { TokenType, Token, EventType, StitchEvent, RunResult, DesignStats, ASTNode, ExprNode, DensityCell, DensityHotspot, DensityResult, RunOptions } from './types.ts';
export { NeedlescriptError } from './errors.ts';
export { makeRNG, makeNoise, fork, gauss } from './prng.ts';
export { ALIASES, BUILTIN_ARITY, QWORD_BUILTINS, FABRICS, FUNC_ARITY, ZERO_FUNCS, LIST_FUNCS, LIST_CMDS, GEN_FUNCS, GEN_CMDS, GEN_QWORD_ARG, LIBRARY_FUNCS, RESERVED } from './commands.ts';
export { suggest } from './suggestions.ts';
export { tokenize } from './tokenizer.ts';
export { parse } from './parser.ts';
export { NsList, isList } from './list.ts';
export type { Val } from './list.ts';
export type { Pt } from './genmath.ts';
export { LIMITS } from './machine.ts';
export { applyLocks, applyAutoTrim, densityMap, designStats } from './postprocess.ts';
export { run } from './interpreter.ts';
