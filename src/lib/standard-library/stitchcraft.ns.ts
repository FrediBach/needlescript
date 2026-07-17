/** NeedleScript source for reusable embroidery construction rituals. */
export const STITCHCRAFT_SOURCE = `
import std.shapes.ellipsepath as circlepath

export def sewrun(path, mm) [
  sewpath(resample(path, mm))
]

export def satinalong(path, w) [
  satin w
  sewpath(path)
  satin 0
]

export def beanoutline(region, n) [
  bean n
  sewpath(closepath(region))
  bean 1
]

def startpath(path) [
  up
  setpos(first(path))
  down
]

export def appliquesteps(region, w) [
  let ring = closepath(region)
  startpath(ring)
  sewrun(ring, 2.5)
  stop
  startpath(ring)
  satinalong(ring, max(0.8, w * 0.35))
  stop
  startpath(ring)
  satinalong(ring, w)
]

export def eyelet(r) [
  assert(r > 0, 'eyelet radius must be greater than zero')
  let ring = xlate(circlepath(r, r), xcor, ycor)
  push
  startpath(ring)
  satinalong(resample(ring, 0.4), clamp(r * 0.55, 0.6, 1.5))
  pop
]

export def gradientbands(region, deg, n) [
  let count = max(1, round(n))
  let rotated = xrotate(region, -deg)
  let bounds = bbox(rotated)
  let bandheight = (bounds[3] - bounds[1]) / count
  let padding = max(bounds[2] - bounds[0], bounds[3] - bounds[1]) + 1
  let out = []
  let band = []
  let pieces = []
  let y0 = 0
  let y1 = 0
  for i = 0 to count - 1 [
    y0 = bounds[1] + i * bandheight
    y1 = bounds[1] + (i + 1) * bandheight
    band = [[bounds[0] - padding, y0], [bounds[2] + padding, y0], [bounds[2] + padding, y1], [bounds[0] - padding, y1]]
    pieces = clippaths(rotated, band, 'intersect')
    for piece in pieces [ append(out, xrotate(piece, deg)) ]
  ]
  return out
]

export def threadblend(region, deg) [
  let rows = fillrows(region, 1.2, deg)
  let baseslot = colorindex()
  for parity = 0 to 1 [
    // colorindex() is one-based while numeric color uses the event index.
    if parity = 1 [ color baseslot ]
    for i = 0 to len(rows) - 1 [
      if mod(i, 2) = parity [
        startpath(rows[i])
        sewrun(rows[i], 2.5)
      ]
    ]
  ]
]

export def stipple(region, mindist) [
  assert(mindist > 0, 'stipple mindist must be greater than zero')
  let points = scatter(mindist, region)
  for p in points [
    if coverat(p, mindist / 3) < 1 [
      push
      up
      setpos(p)
      down
      arc 360 clamp(mindist * 0.12, 0.3, 0.7)
      pop
    ]
  ]
]
`;
