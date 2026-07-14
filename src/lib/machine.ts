// Re-export everything from the machine/ subdirectory.
// This shim keeps all existing import paths working unchanged.
export {
  LIMITS,
  STOCK_LIMITS,
  OVERRIDE_CEILINGS,
  OVERRIDE_FLOORS,
  Machine,
} from './machine/index.ts';
export type { BudgetKey } from './machine/index.ts';
