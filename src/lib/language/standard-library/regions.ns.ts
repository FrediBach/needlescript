/** NeedleScript source for region measurement, anchors, insets, tiling, and partitioning. */
export const REGIONS_SOURCE = `
export def regionarea(region) [
  let twicearea = 0
  for i = 0 to len(region) - 1 [
    let j = mod(i + 1, len(region))
    twicearea += region[i][0] * region[j][1] - region[j][0] * region[i][1]
  ]
  return abs(twicearea) / 2
]

def edgedistance(p, region) [
  let best = 1000000000
  let d = 0
  for i = 0 to len(region) - 1 [
    d = segdist(p, region[i], region[mod(i + 1, len(region))])
    if d < best [ best = d ]
  ]
  return best
]

export def poleof(region) [
  let bounds = bbox(region)
  let span = max(bounds[2] - bounds[0], bounds[3] - bounds[1])
  let stepmm = span / 8
  let best = centroid(region)
  let bestdist = -1
  let candidate = [0, 0]
  let d = 0
  if inpath(best, region) [ bestdist = edgedistance(best, region) ]
  for ix = 0 to 8 [
    for iy = 0 to 8 [
      candidate = [bounds[0] + ix * (bounds[2] - bounds[0]) / 8, bounds[1] + iy * (bounds[3] - bounds[1]) / 8]
      if inpath(candidate, region) [
        d = edgedistance(candidate, region)
        if d > bestdist [ best = candidate bestdist = d ]
      ]
    ]
  ]
  repeat 7 [
    stepmm /= 2
    for ix = -1 to 1 [
      for iy = -1 to 1 [
        candidate = [best[0] + ix * stepmm, best[1] + iy * stepmm]
        if inpath(candidate, region) [
          d = edgedistance(candidate, region)
          if d > bestdist [ best = candidate bestdist = d ]
        ]
      ]
    ]
  ]
  return best
]

export def insetrings(region, gap, n) [
  let out = []
  let current = [copy(region)]
  let nextlevel = []
  let pieces = []
  repeat max(0, round(n)) [
    nextlevel = []
    for ring in current [
      pieces = offsetpath(ring, -abs(gap))
      for piece in pieces [ append(nextlevel, piece) append(out, piece) ]
    ]
    current = nextlevel
  ]
  return out
]

def squarecell(cx, cy, size) [
  let half = size / 2
  return [[cx - half, cy - half], [cx + half, cy - half], [cx + half, cy + half], [cx - half, cy + half]]
]

def hexcell(cx, cy, radius) [
  let out = []
  for i = 0 to 5 [ append(out, [cx + cos(i * 60) * radius, cy + sin(i * 60) * radius]) ]
  return out
]

def addclipped(out, cellregion, region) [
  let pieces = clippaths(cellregion, region, 'intersect')
  for piece in pieces [ if len(piece) >= 3 [ append(out, piece) ] ]
]

export def tilecells(region, kind, cell) [
  assert(kind = 'square' or kind = 'hex' or kind = 'tri', 'tilecells kind must be square, hex, or tri')
  assert(cell > 0, 'tilecells cell must be greater than zero')
  let out = []
  let bounds = bbox(region)
  let size = max(0.000001, abs(cell))
  let cx = 0
  let cy = 0
  let half = size / 2
  let xstep = size
  let ystep = size
  let offsety = 0
  let cellregion = []
  let tri1 = []
  let tri2 = []
  let colstart = 0
  let colend = 0
  let rowstart = 0
  let rowend = 0
  if kind = 'hex' [ xstep = size * 1.5 ystep = size * sqrt(3) ]
  colstart = floor(bounds[0] / xstep) - 2
  colend = ceil(bounds[2] / xstep) + 2
  rowstart = floor(bounds[1] / ystep) - 2
  rowend = ceil(bounds[3] / ystep) + 2
  for col = colstart to colend [
    if kind = 'hex' and mod(col, 2) != 0 [ offsety = ystep / 2 ] else [ offsety = 0 ]
    cx = col * xstep
    for rowidx = rowstart to rowend [
      cy = rowidx * ystep + offsety
      if kind = 'hex' [
        cellregion = hexcell(cx, cy, size)
        addclipped(out, cellregion, region)
      ] else if kind = 'tri' [
        tri1 = [[cx - half, cy - half], [cx + half, cy - half], [cx + half, cy + half]]
        tri2 = [[cx - half, cy - half], [cx + half, cy + half], [cx - half, cy + half]]
        addclipped(out, tri1, region)
        addclipped(out, tri2, region)
      ] else [
        cellregion = squarecell(cx, cy, size)
        addclipped(out, cellregion, region)
      ]
    ]
  ]
  return out
]

export def gridpoints(region, cell) [
  assert(cell > 0, 'gridpoints cell must be greater than zero')
  let out = []
  let bounds = bbox(region)
  let size = max(0.000001, abs(cell))
  let p = [0, 0]
  let xcount = max(0, floor((bounds[2] - bounds[0]) / size))
  let ycount = max(0, floor((bounds[3] - bounds[1]) / size))
  for ix = 0 to xcount - 1 [
    for iy = 0 to ycount - 1 [
      p = [bounds[0] + (ix + 0.5) * size, bounds[1] + (iy + 0.5) * size]
      if inpath(p, region) [ append(out, p) ]
    ]
  ]
  return out
]

export def partitions(region, n) [
  let count = max(1, round(n))
  let spacing = sqrt(regionarea(region) / count) * 0.75
  let seeds = scatter(max(0.000001, spacing), region)
  let backup = []
  let cells = []
  let moved = []
  let backupcell = max(0.000001, spacing / 2)
  let candidate = [0, 0]
  if len(seeds) > count [ seeds = slice(seeds, 0, count) ]
  repeat 8 [
    if len(seeds) < count [
      backup = gridpoints(region, backupcell)
      for p in backup [
        if len(seeds) < count and contains(seeds, p) = 0 [ append(seeds, p) ]
      ]
    ]
    backupcell /= 2
  ]
  while len(seeds) < count [ append(seeds, poleof(region)) ]
  repeat 2 [
    cells = voronoi(seeds, region)
    moved = []
    for i = 0 to len(seeds) - 1 [
      if len(cells[i]) >= 3 [
        candidate = centroid(cells[i])
        if inpath(candidate, region) [ append(moved, candidate) ] else [ append(moved, poleof(cells[i])) ]
      ] else [ append(moved, seeds[i]) ]
    ]
    seeds = moved
  ]
  return voronoi(seeds, region)
]
`;
