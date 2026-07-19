/** NeedleScript source for centered outline path constructors. */
export const SHAPES_SOURCE = `
def closedpath(points) [
  let out = copy(points)
  if len(out) > 0 [ append(out, copy(out[0])) ]
  return out
]

def signedpow(v, e) [
  if v < 0 [ return -pow(-v, e) ] else [ return pow(v, e) ]
]

export def polypath(n, r) [
  let points = []
  let count = max(3, round(n))
  for i = 0 to count - 1 [ append(points, vfromheading(-i * 360 / count, r)) ]
  return closedpath(points)
]

export def starpath(n, rout, rin) [
  let points = []
  let count = max(2, round(n))
  let radius = 0
  for i = 0 to count * 2 - 1 [
    if mod(i, 2) = 0 [ radius = rout ] else [ radius = rin ]
    append(points, vfromheading(-i * 180 / count, radius))
  ]
  return closedpath(points)
]

export def rectpath(w, h) [
  return [[0, h / 2], [-w / 2, h / 2], [-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [0, h / 2]]
]

export def roundrect(w, h, r) [
  let points = []
  let radius = clamp(abs(r), 0, min(abs(w), abs(h)) / 2)
  let stepsper = 8
  let cx = 0
  let cy = 0
  let ang = 0
  append(points, [0, h / 2])
  append(points, [-w / 2 + radius, h / 2])
  for corner = 0 to 3 [
    if corner = 0 [ cx = -w / 2 + radius cy = h / 2 - radius ]
    else if corner = 1 [ cx = -w / 2 + radius cy = -h / 2 + radius ]
    else if corner = 2 [ cx = w / 2 - radius cy = -h / 2 + radius ]
    else [ cx = w / 2 - radius cy = h / 2 - radius ]
    for j = 0 to stepsper [
      ang = 90 + corner * 90 + j * 90 / stepsper
      append(points, [cx + cos(ang) * radius, cy + sin(ang) * radius])
    ]
  ]
  append(points, [0, h / 2])
  return points
]

export def ellipsepath(rx, ry) [
  let points = []
  let count = 64
  let ang = 0
  for i = 0 to count - 1 [
    ang = 90 + i * 360 / count
    append(points, [cos(ang) * rx, sin(ang) * ry])
  ]
  return closedpath(points)
]

export def arcpath(deg, r) [
  let points = []
  let count = max(1, ceil(abs(deg) / 6))
  for i = 0 to count [ append(points, vfromheading(-deg * i / count, r)) ]
  return points
]

export def coilpath(turns, r0, r1) [
  let points = []
  let count = max(1, ceil(abs(turns) * 72))
  let u = 0
  for i = 0 to count [
    u = i / count
    append(points, vfromheading(-turns * 360 * u, lerp(r0, r1, u)))
  ]
  return points
]

export def heartpath(size) [
  let points = []
  let count = 96
  let ang = 0
  let x = 0
  let y = 0
  for i = 0 to count - 1 [
    // Begin at the north-west lobe; increasing the parameter after the x flip
    // walks the outline counter-clockwise.
    ang = 52 + i * 360 / count
    x = 16 * pow(sin(ang), 3) / 32 * size
    y = (13 * cos(ang) - 5 * cos(2 * ang) - 2 * cos(3 * ang) - cos(4 * ang)) / 32 * size
    append(points, [-x, y])
  ]
  return closedpath(points)
]

export def gearpath(teeth, r, depth) [
  let points = []
  let count = max(3, round(teeth))
  let radius = 0
  for i = 0 to count * 4 - 1 [
    if mod(i, 4) < 2 [ radius = r ] else [ radius = max(0, r - depth) ]
    append(points, vfromheading(-i * 90 / count, radius))
  ]
  return closedpath(points)
]

export def superellipsepath(w, h, e) [
  let points = []
  let count = 96
  let power = 2 / max(0.01, e)
  let ang = 0
  for i = 0 to count - 1 [
    ang = 90 + i * 360 / count
    append(points, [w / 2 * signedpow(cos(ang), power), h / 2 * signedpow(sin(ang), power)])
  ]
  return closedpath(points)
]

export def wavepath(length, amp, cycles) [
  let points = []
  let count = max(1, ceil(abs(cycles) * 24))
  let u = 0
  for i = 0 to count [
    u = i / count
    append(points, [lerp(-length / 2, length / 2, u), sin(u * cycles * 360) * amp])
  ]
  return points
]

export def rosepath(k, r) [
  let points = []
  let count = max(72, ceil(abs(k) * 72))
  let ang = 0
  let radius = 0
  for i = 0 to count - 1 [
    ang = i * 360 / count
    radius = cos(k * ang) * r
    append(points, vfromheading(-ang, radius))
  ]
  return closedpath(points)
]

export def lissajouspath(a, b, phase, size) [
  let points = []
  let count = max(96, ceil(max(abs(a), abs(b)) * 64))
  let ang = 0
  for i = 0 to count - 1 [
    ang = i * 360 / count
    append(points, [sin(a * ang + phase) * size / 2, cos(b * ang) * size / 2])
  ]
  return closedpath(points)
]
`;
