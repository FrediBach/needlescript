/** NeedleScript source for reusable embroidery construction rituals. */
export const STITCHCRAFT_SOURCE = `
import std.shapes.ellipsepath as circlepath
import std.listx.sortby as sortby

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

def gradientrowaxis(path, deg) [
  let p = first(path)
  return 0 - p[0] * sin(deg) + p[1] * cos(deg)
]

export def gradientrows(region, deg, pitch, amount) [
  assert(pitch >= 0.25 and pitch <= 5, 'gradientrows pitch must be from 0.25 to 5 mm')
  assert(isref(amount), 'gradientrows amount must be a one-argument reporter reference')

  let rows = fillrows(region, pitch, deg)
  if len(rows) = 0 [ return [[], []] ]

  let axisof = def(path) [ return gradientrowaxis(path, deg) ]
  let ordered = sortby(rows, axisof)
  let axes = map(ordered, axisof)
  let lo = first(axes)
  let span = last(axes) - lo
  let rowsa = []
  let rowsb = []
  let error = 0
  let rowstart = 0
  let rowend = 0
  let axis = 0
  let v = 0
  let shareb = 0
  let group = rowsa

  while rowstart < len(ordered) [
    axis = axes[rowstart]
    rowend = rowstart + 1
    while rowend < len(ordered) and abs(axes[rowend] - axis) < 0.000001 [ rowend += 1 ]

    if abs(span) < 0.000001 [ v = 0.5 ] else [ v = (axis - lo) / span ]
    shareb = amount(v)
    assert(shareb >= 0 and shareb <= 1, 'gradientrows amount must return a number from 0 to 1')

    error += shareb
    group = rowsa
    if error >= 0.5 [
      group = rowsb
      error -= 1
    ]
    for i = rowstart to rowend - 1 [ append(group, ordered[i]) ]
    rowstart = rowend
  ]
  return [rowsa, rowsb]
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
