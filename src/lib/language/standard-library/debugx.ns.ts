/** NeedleScript source for preview overlays and stitch-history diagnostics. */
export const DEBUGX_SOURCE = `
export def chalkgrid(cell) [
  assert(cell > 0, 'chalkgrid cell must be greater than zero')
  let bounds = fieldbounds()
  let lines = []
  let xstart = floor(bounds[0] / cell) * cell
  let xend = ceil(bounds[2] / cell) * cell
  let ystart = floor(bounds[1] / cell) * cell
  let yend = ceil(bounds[3] / cell) * cell
  let xcount = max(0, round((xend - xstart) / cell))
  let ycount = max(0, round((yend - ystart) / cell))
  for i = 0 to xcount [ append(lines, [[xstart + i * cell, bounds[1]], [xstart + i * cell, bounds[3]]]) ]
  for i = 0 to ycount [ append(lines, [[bounds[0], ystart + i * cell], [bounds[2], ystart + i * cell]]) ]
  chalk(lines, 'grid', 'line')
]

export def chalkbbox(path) [
  let bounds = bbox(path)
  let boxpath = [
    [bounds[0], bounds[1]],
    [bounds[2], bounds[1]],
    [bounds[2], bounds[3]],
    [bounds[0], bounds[3]],
    [bounds[0], bounds[1]]
  ]
  chalk(boxpath, 'bbox', 'line')
]

export def chalkfield() [
  chalk(fieldpath(), 'field', 'line')
]

// Approximate top-thread use from committed penetrations. Stitch history does
// not retain trims or colour boundaries, so this intentionally remains an
// estimate rather than claiming the exact postprocessed RunResult statistic.
export def threadestimate() [
  let points = stitchedpoints()
  if len(points) < 2 [ return 0 ]
  return pathlen(points)
]

// Return [distance-mm, coverage-layers] samples along a path.
export def coverprofile(path, stride) [
  assert(stride > 0, 'coverprofile stride must be greater than zero')
  let out = []
  if len(path) = 0 [ return out ]
  if len(path) = 1 [ return [[0, coverat(path[0])]] ]
  let samples = resample(path, stride)
  let traveled = 0
  for i = 0 to len(samples) - 1 [
    if i > 0 [ traveled += vdist(samples[i - 1], samples[i]) ]
    append(out, [traveled, coverat(samples[i])])
  ]
  return out
]
`;
