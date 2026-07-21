export {
  getPhysicsDiagnosticCatalogEntry,
  PHYSICS_DIAGNOSTIC_CATALOG,
  validatePhysicsDiagnosticCatalog,
} from './catalog.ts';
export type { PhysicsDiagnosticCatalogEntry, PhysicsDiagnosticCode } from './catalog.ts';
export {
  assignPhysicsDiagnosticIdentities,
  buildPhysicsDiagnosticFingerprint,
} from './identity.ts';
export type { PhysicsDiagnosticIdentityInput } from './identity.ts';
export { buildPhysicsReport, PHYSICS_REPORT_VERSION } from './compatibility.ts';
export type { PhysicsReportCompatibilityInput } from './compatibility.ts';
