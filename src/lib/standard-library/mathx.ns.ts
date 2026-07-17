/** NeedleScript source for scalar, angle, vector, and deterministic randomness helpers. */
export const MATHX_SOURCE = `
export def easein(t) [
  let u = clamp(t, 0, 1)
  return u * u
]

export def easeout(t) [
  let u = clamp(t, 0, 1)
  return 1 - (1 - u) * (1 - u)
]

export def easeinout(t) [
  let u = clamp(t, 0, 1)
  if u < 0.5 [ return 2 * u * u ] else [ return 1 - pow(-2 * u + 2, 2) / 2 ]
]

export def easeback(t) [
  let u = clamp(t, 0, 1)
  let c1 = 1.70158
  let c3 = c1 + 1
  return c3 * u * u * u - c1 * u * u
]

export def triwave(t) [
  let u = mod(t, 1)
  return 1 - abs(2 * u - 1) * 2
]

export def pulse(t, duty) [
  if mod(t, 1) < clamp(duty, 0, 1) [ return 1 ] else [ return 0 ]
]

export def wrapdeg(d) [ return mod(d, 360) ]

export def angdiff(a, b) [ return mod(b - a + 180, 360) - 180 ]

export def lerpheading(a, b, t) [ return mod(a + angdiff(a, b) * t, 360) ]

export def vperp(v) [ return [-v[1], v[0]] ]

export def vproj(a, b) [
  let d = vdot(b, b)
  if d < 0.000000001 [ return [0, 0] ] else [ return vscale(b, vdot(a, b) / d) ]
]

export def vreflect(v, n) [
  let d = vdot(n, n)
  if d < 0.000000001 [ return copy(v) ] else [ return vsub(v, vscale(n, 2 * vdot(v, n) / d)) ]
]

export def remapc(v, inlo, inhi, outlo, outhi) [
  if abs(inhi - inlo) < 0.000000001 [ return outlo ]
  let u = clamp((v - inlo) / (inhi - inlo), 0, 1)
  return lerp(outlo, outhi, u)
]

// Draw counts: randbetween 1, randint 1, chance 1, weightedpick 1, jitterpt 2.
export def randbetween(a, b) [ return a + random(b - a) ]

export def randint(a, b) [
  let lo = ceil(min(a, b))
  let hi = floor(max(a, b))
  if hi < lo [ return lo ] else [ return lo + floor(random(hi - lo + 1)) ]
]

export def chance(p) [
  if random(1) < clamp(p, 0, 1) [ return 1 ] else [ return 0 ]
]

export def weightedpick(xs, ws) [
  let total = sum(ws)
  let dart = random(total)
  let accum = 0
  let answer = xs[len(xs) - 1]
  let found = 0
  for i = 0 to len(xs) - 1 [
    if found = 0 [
      accum += ws[i]
      if dart < accum [ answer = xs[i] found = 1 ]
    ]
  ]
  return answer
]

export def jitterpt(p, mm) [
  return [p[0] + random(mm * 2) - mm, p[1] + random(mm * 2) - mm]
]
`;
