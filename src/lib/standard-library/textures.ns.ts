/** NeedleScript source for direction fields, fill shapers, and geometric fill paths. */
export const TEXTURES_SOURCE = `
export def radialdir(p) [
  if vlen(p) < 0.000001 [ return 0 ]
  return vheading(p)
]

// A drawless, divergence-free direction field. Rotating the gradient of a
// scalar noise field by 90 degrees makes streamlines circulate instead of
// converging on a pole. The 14 mm scale is a useful embroidery default.
export def curldir(p) [
  let epsilon = 0.05
  let scaledown = 14
  let dx = snoise2(p[0] / scaledown + epsilon, p[1] / scaledown) - snoise2(p[0] / scaledown - epsilon, p[1] / scaledown)
  let dy = snoise2(p[0] / scaledown, p[1] / scaledown + epsilon) - snoise2(p[0] / scaledown, p[1] / scaledown - epsilon)
  let flow = [dy, -dx]
  if vlen(flow) < 0.000001 [ return 0 ]
  return vheading(flow)
]

// Alternating brick phase gives neighbouring rows a simple over-under rhythm.
export def wovenshape(p, row, v) [
  return tatamirow(0.8, 3, mod(row, 2) * 0.5)
]

// A reporter-compatible spacing ramp across the fill's normalized cross-field axis.
export def gradientshape(p, row, v) [
  return tatamirow(lerp(0.45, 1.2, clamp(v, 0, 1)), 2.5, 0.5)
]

def addcut(cuts, p, startpoint) [
  if contains(cuts, p) [ return ]
  let at = len(cuts)
  let pdist = vdist(startpoint, p)
  for i = 0 to len(cuts) - 1 [
    if at = len(cuts) and pdist < vdist(startpoint, cuts[i]) [ at = i ]
  ]
  insertat(cuts, at, p)
]

// Clip arbitrary open polyline segments against a simple region. Returning
// two-point fragments is deliberate: the fill engine can route them without
// adding connector stitches across holes or concavities.
def cliptexturepaths(paths, region) [
  let out = []
  let boundary = closepath(region)
  let cuts = []
  let crossing = []
  let midpoint = [0, 0]
  for path in paths [
    for i = 0 to len(path) - 2 [
      cuts = [copy(path[i]), copy(path[i + 1])]
      for j = 0 to len(boundary) - 2 [
        crossing = segisect(path[i], path[i + 1], boundary[j], boundary[j + 1])
        if len(crossing) = 2 [ addcut(cuts, crossing, path[i]) ]
      ]
      for j = 0 to len(cuts) - 2 [
        midpoint = vlerp(cuts[j], cuts[j + 1], 0.5)
        if vdist(cuts[j], cuts[j + 1]) > 0.000001 and inpath(midpoint, region) [
          append(out, [cuts[j], cuts[j + 1]])
        ]
      ]
    ]
  ]
  return out
]

def hilbertrotate(size, x, y, rx, ry) [
  let outx = x
  let outy = y
  if ry = 0 [
    if rx = 1 [ outx = size - 1 - outx outy = size - 1 - outy ]
    let swap = outx
    outx = outy
    outy = swap
  ]
  return [outx, outy]
]

def hilbertpoint(size, index) [
  let x = 0
  let y = 0
  let t = index
  let rx = 0
  let ry = 0
  let rotated = [0, 0]
  let gridsize = 1
  while gridsize < size [
    rx = mod(floor(t / 2), 2)
    ry = mod(t, 2)
    if rx = 1 [ ry = 1 - ry ]
    rotated = hilbertrotate(gridsize, x, y, rx, ry)
    x = rotated[0] + gridsize * rx
    y = rotated[1] + gridsize * ry
    t = floor(t / 4)
    gridsize *= 2
  ]
  return [x, y]
]

export def hilbertpaths(region, cell) [
  assert(cell > 0, 'hilbertpaths cell must be greater than zero')
  let bounds = bbox(region)
  let span = max(bounds[2] - bounds[0], bounds[3] - bounds[1])
  let order = 2
  while order * cell < span [ order *= 2 ]
  let curve = []
  let gridpoint = [0, 0]
  for i = 0 to order * order - 1 [
    gridpoint = hilbertpoint(order, i)
    append(curve, [bounds[0] + (gridpoint[0] + 0.5) * span / order, bounds[1] + (gridpoint[1] + 0.5) * span / order])
  ]
  return cliptexturepaths([curve], region)
]

def quarterarc(cx, cy, radius, startdeg) [
  let path = []
  for i = 0 to 6 [
    append(path, [cx + cos(startdeg + i * 15) * radius, cy + sin(startdeg + i * 15) * radius])
  ]
  return path
]

export def truchetpaths(region, cell) [
  assert(cell > 0, 'truchetpaths cell must be greater than zero')
  let bounds = bbox(region)
  let raw = []
  let col0 = floor(bounds[0] / cell) - 1
  let col1 = ceil(bounds[2] / cell) + 1
  let row0 = floor(bounds[1] / cell) - 1
  let row1 = ceil(bounds[3] / cell) + 1
  let leftedge = 0
  let bottomedge = 0
  for col = col0 to col1 [
    for row = row0 to row1 [
      leftedge = col * cell
      bottomedge = row * cell
      if mod(col + row, 2) = 0 [
        append(raw, quarterarc(leftedge, bottomedge, cell / 2, 0))
        append(raw, quarterarc(leftedge + cell, bottomedge + cell, cell / 2, 180))
      ] else [
        append(raw, quarterarc(leftedge + cell, bottomedge, cell / 2, 90))
        append(raw, quarterarc(leftedge, bottomedge + cell, cell / 2, 270))
      ]
    ]
  ]
  return cliptexturepaths(raw, region)
]

export def hitomezashi(region, cell, rowbits, colbits) [
  assert(cell > 0, 'hitomezashi cell must be greater than zero')
  assert(len(rowbits) > 0 and len(colbits) > 0, 'hitomezashi bit lists must not be empty')
  let bounds = bbox(region)
  let raw = []
  let x0 = floor(bounds[0] / cell) - 1
  let x1 = ceil(bounds[2] / cell) + 1
  let y0 = floor(bounds[1] / cell) - 1
  let y1 = ceil(bounds[3] / cell) + 1
  let phase = 0
  for row = y0 to y1 [
    phase = mod(round(rowbits[mod(row, len(rowbits))]), 2)
    for col = x0 to x1 - 1 [
      if mod(col + phase, 2) = 0 [ append(raw, [[col * cell, row * cell], [(col + 1) * cell, row * cell]]) ]
    ]
  ]
  for col = x0 to x1 [
    phase = mod(round(colbits[mod(col, len(colbits))]), 2)
    for row = y0 to y1 - 1 [
      if mod(row + phase, 2) = 0 [ append(raw, [[col * cell, row * cell], [col * cell, (row + 1) * cell]]) ]
    ]
  ]
  return cliptexturepaths(raw, region)
]

def semicircle(cx, cy, radius) [
  let path = []
  for i = 0 to 12 [ append(path, [cx + cos(180 + i * 15) * radius, cy + sin(180 + i * 15) * radius]) ]
  return path
]

export def seigaiha(region, r) [
  assert(r > 0, 'seigaiha radius must be greater than zero')
  let bounds = bbox(region)
  let raw = []
  let row0 = floor(bounds[1] / r) - 2
  let row1 = ceil(bounds[3] / r) + 2
  let col0 = floor(bounds[0] / (2 * r)) - 2
  let col1 = ceil(bounds[2] / (2 * r)) + 2
  let cx = 0
  let cy = 0
  for row = row0 to row1 [
    for col = col0 to col1 [
      cx = col * 2 * r + mod(row, 2) * r
      cy = row * r
      append(raw, semicircle(cx, cy, r))
      append(raw, semicircle(cx, cy, r * 2 / 3))
      append(raw, semicircle(cx, cy, r / 3))
    ]
  ]
  return cliptexturepaths(raw, region)
]

export def asanoha(region, cell) [
  assert(cell > 0, 'asanoha cell must be greater than zero')
  let bounds = bbox(region)
  let raw = []
  let ystep = cell * sqrt(3) / 2
  let row0 = floor(bounds[1] / ystep) - 2
  let row1 = ceil(bounds[3] / ystep) + 2
  let col0 = floor(bounds[0] / cell) - 2
  let col1 = ceil(bounds[2] / cell) + 2
  let center = [0, 0]
  let vertex = [0, 0]
  let nextvertex = [0, 0]
  for row = row0 to row1 [
    for col = col0 to col1 [
      center = [col * cell + mod(row, 2) * cell / 2, row * ystep]
      for spoke = 0 to 5 [
        vertex = vadd(center, vfromheading(spoke * 60, cell / 2))
        nextvertex = vadd(center, vfromheading((spoke + 1) * 60, cell / 2))
        append(raw, [center, vertex])
        append(raw, [vertex, vlerp(vertex, nextvertex, 0.5)])
      ]
    ]
  ]
  return cliptexturepaths(raw, region)
]

export def herringbonepaths(region, w) [
  assert(w > 0, 'herringbonepaths width must be greater than zero')
  let bounds = bbox(region)
  let raw = []
  let row0 = floor(bounds[1] / w) - 2
  let row1 = ceil(bounds[3] / w) + 2
  let col0 = floor(bounds[0] / (2 * w)) - 2
  let col1 = ceil(bounds[2] / (2 * w)) + 2
  let x = 0
  let y = 0
  for row = row0 to row1 [
    for col = col0 to col1 [
      x = col * 2 * w + mod(row, 2) * w
      y = row * w
      append(raw, [[x - w, y - w], [x, y], [x + w, y - w]])
      append(raw, [[x, y], [x + w, y + w], [x + 2 * w, y]])
    ]
  ]
  return cliptexturepaths(raw, region)
]
`;
