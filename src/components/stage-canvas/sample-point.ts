/** Format a sampled hoop-space coordinate as a NeedleScript point literal. */
export function formatPointLiteral(x: number, y: number): string {
  return `[${x.toFixed(1)}, ${y.toFixed(1)}]`;
}
