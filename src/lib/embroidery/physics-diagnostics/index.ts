export {
  getPhysicsDiagnosticCatalogEntry,
  PHYSICS_DIAGNOSTIC_CATALOG,
  PHYSICS_DIAGNOSTIC_CATALOG_VERSION,
  PHYSICS_EVIDENCE_REFERENCES,
  PHYSICS_THRESHOLD_VERSION,
  physicsEvidenceReferences,
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
