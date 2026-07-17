/** NeedleScript source for `std.textures`. Kept as source so std code uses the language itself. */
export const TEXTURES_SOURCE = `
export def radialdir(p) [
  if vlen(p) < 0.000001 [ return 0 ]
  return vheading(p)
]
`;
