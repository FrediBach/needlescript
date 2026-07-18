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

def gradientnmessage(row, detail) [
  return concat(concat(concat('gradientrowsn @weights row ', str(row)), ': '), detail)
]

export def serpentinerows(rows, reversed) [
  if len(rows) = 0 [ return [] ]
  if reversed [
    return routesort(rows, last(last(rows)), 'both')
  ] else [
    return routesort(rows, first(first(rows)), 'both')
  ]
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

export def gradientrowsn(region, deg, pitch, weights) [
  assert(pitch >= 0.25 and pitch <= 5, 'gradientrowsn pitch must be from 0.25 to 5 mm')
  assert(isref(weights), 'gradientrowsn weights must be a one-argument reporter reference')

  let rows = fillrows(region, pitch, deg)
  if len(rows) = 0 [ return [] ]

  let axisof = def(path) [ return gradientrowaxis(path, deg) ]
  let ordered = sortby(rows, axisof)
  let axes = map(ordered, axisof)
  let lo = first(axes)
  let span = last(axes) - lo
  let groups = []
  let errors = []
  let channelcount = 0
  let candidate = 0
  let rowstart = 0
  let rowend = 0
  let axis = 0
  let v = 0
  let raw = []
  let total = 0
  let weight = 0
  let message = ''
  let chosen = 0
  let best = 0

  while rowstart < len(ordered) [
    axis = axes[rowstart]
    rowend = rowstart + 1
    while rowend < len(ordered) and abs(axes[rowend] - axis) < 0.000001 [ rowend += 1 ]

    if abs(span) < 0.000001 [ v = 0.5 ] else [ v = (axis - lo) / span ]
    raw = weights(v)
    assert(islist(raw), gradientnmessage(candidate, 'must return a weight list'))
    if channelcount = 0 [
      assert(len(raw) >= 2 and len(raw) <= 8, gradientnmessage(candidate, 'must return 2 to 8 weights'))
      channelcount = len(raw)
      repeat channelcount [ append(groups, []) append(errors, 0) ]
    ] else [
      message = concat('must keep list length fixed at ', str(channelcount))
      assert(len(raw) = channelcount, gradientnmessage(candidate, message))
    ]

    total = 0
    for channel = 0 to channelcount - 1 [
      weight = raw[channel]
      message = concat(concat('weight ', str(channel)), ' must be a number')
      assert(islist(weight) = 0 and isstring(weight) = 0 and isref(weight) = 0, gradientnmessage(candidate, message))
      message = concat(concat('weight ', str(channel)), ' must be non-negative')
      assert(weight >= 0, gradientnmessage(candidate, message))
      total += weight
    ]
    assert(total > 0, gradientnmessage(candidate, 'weights must contain at least one positive value'))

    // Deficit = normalized desired prefix count minus assigned prefix count.
    for channel = 0 to channelcount - 1 [ errors[channel] += raw[channel] / total ]
    chosen = 0
    best = errors[0]
    for channel = 1 to channelcount - 1 [
      if errors[channel] > best + 0.000000001 [ chosen = channel best = errors[channel] ]
    ]
    errors[chosen] -= 1
    for i = rowstart to rowend - 1 [ append(groups[chosen], ordered[i]) ]

    rowstart = rowend
    candidate += 1
  ]
  return groups
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

def stitchcraftrings(region, label) [
  if ispath(region) [ return [region] ]
  assert(islist(region) and len(region) > 0, concat(label, ' region must be a ring or compound ring list'))
  for ring in region [
    assert(ispath(ring) and len(ring) >= 3, concat(label, ' region entries must be rings of at least 3 points'))
  ]
  return copy(region)
]

def stitchcraftclosedring(ring) [
  if first(ring) = last(ring) [ return copy(ring) ]
  return closepath(ring)
]

def stitchcraftclosed(rings) [
  let out = []
  for ring in rings [ append(out, stitchcraftclosedring(ring)) ]
  return out
]

def stitchcraftringdepth(ring, rings) [
  let depth = 0
  let sample = first(ring)
  for other in rings [
    if ring != other and inpath(sample, other) [ depth += 1 ]
  ]
  return depth
]

def stitchcraftinset(rings, inset) [
  if inset < 0.000001 [ return copy(rings) ]
  let out = []
  let delta = 0
  let pieces = []
  for ring in rings [
    if mod(stitchcraftringdepth(ring, rings), 2) = 0 [ delta = 0 - inset ] else [ delta = inset ]
    pieces = offsetpath(ring, delta)
    for piece in pieces [ append(out, piece) ]
  ]
  return out
]

def stitchcraftsewrows(region, deg, spacing, mm) [
  let rows = serpentinerows(fillrows(region, spacing, deg), false)
  for row in rows [ startpath(row) sewrun(row, mm) ]
]

def stitchcraftsewrings(rings, mm) [
  for ring in rings [
    let closed = stitchcraftclosedring(ring)
    startpath(closed)
    sewrun(closed, mm)
  ]
]

def stitchcraftsatinrings(rings, width) [
  for ring in rings [
    let closed = stitchcraftclosedring(ring)
    startpath(closed)
    satinalong(closed, width)
  ]
]

export def knockdown(region, deg, spacing) [
  assert(spacing >= 1 and spacing <= 5, 'knockdown spacing must be from 1 to 5 mm')
  // Foundation rows are always plain running stitch; no fill/satin underlay is added.
  satin 0
  estitch 0
  bean 1
  stitchcraftsewrows(region, deg, spacing, 3.5)
]

export def fillbordergeometry(region, coverwidth, overlap) [
  assert(coverwidth >= 0.8 and coverwidth <= 8, 'fillbordergeometry cover width must be from 0.8 to 8 mm')
  assert(overlap >= 0 and overlap <= coverwidth / 2, 'fillbordergeometry overlap must be from 0 to half the cover width')
  let rings = stitchcraftrings(region, 'fillbordergeometry')
  let inset = coverwidth / 2 - overlap
  let fillrings = stitchcraftinset(rings, inset)
  let borders = stitchcraftclosed(rings)
  return [fillrings, borders, inset]
]

export def fillandborderwith(region, deg, spacing, coverwidth, overlap) [
  assert(spacing >= 0.25 and spacing <= 5, 'fillandborderwith spacing must be from 0.25 to 5 mm')
  let geometry = fillbordergeometry(region, coverwidth, overlap)
  assert(len(geometry[0]) > 0, 'fillandborderwith inset collapsed the fill region — reduce cover width or increase overlap')

  satin 0
  estitch 0
  bean 1
  stitchcraftsewrows(geometry[0], deg, spacing, 2.5)
  stop
  stitchcraftsatinrings(geometry[1], coverwidth)
]

export def fillandborder(region, deg, spacing, coverwidth) [
  fillandborderwith(region, deg, spacing, coverwidth, 0.4)
]

export def appliquewith(region, placementinset, tackdowninset, coverwidth, stops) [
  assert(placementinset >= 0, 'appliquewith placement inset must be non-negative')
  assert(tackdowninset >= 0, 'appliquewith tackdown inset must be non-negative')
  assert(coverwidth >= 0.8 and coverwidth <= 8, 'appliquewith cover width must be from 0.8 to 8 mm')
  assert(islist(stops) and len(stops) = 2, 'appliquewith stops must be [afterPlacement, afterTackdown]')

  let rings = stitchcraftrings(region, 'appliquewith')
  let placementrings = stitchcraftinset(rings, placementinset)
  let tackdownrings = stitchcraftinset(rings, tackdowninset)
  assert(len(placementrings) > 0, 'appliquewith placement inset collapsed the region')
  assert(len(tackdownrings) > 0, 'appliquewith tackdown inset collapsed the region')

  satin 0
  estitch 0
  bean 1
  stitchcraftsewrings(placementrings, 2.5)
  if stops[0] [ stop ]
  stitchcraftsatinrings(tackdownrings, max(0.8, coverwidth * 0.35))
  if stops[1] [ stop ]
  stitchcraftsatinrings(rings, coverwidth)
]
`;
