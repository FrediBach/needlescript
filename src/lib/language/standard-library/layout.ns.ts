/** NeedleScript source for point/heading placements and path fitting. */
export const LAYOUT_SOURCE = `
import std.pathops.pointat as pathpointat
import std.pathops.headingat as pathheadingat

export def circlelayout(n, r) [
  let out = []
  let count = max(0, round(n))
  let hdg = 0
  for i = 0 to count - 1 [
    hdg = -i * 360 / count
    append(out, [vfromheading(hdg, r), mod(hdg - 90, 360)])
  ]
  return out
]

export def gridlayout(cols, rows, dx, dy) [
  let out = []
  let colcount = max(0, round(cols))
  let rowcount = max(0, round(rows))
  for row = 0 to rowcount - 1 [
    for col = 0 to colcount - 1 [
      append(out, [[(col - (colcount - 1) / 2) * dx, ((rowcount - 1) / 2 - row) * dy], 0])
    ]
  ]
  return out
]

export def alongpath(path, n) [
  let out = []
  let count = max(0, round(n))
  let u = 0
  for i = 0 to count - 1 [
    if count = 1 [ u = 0.5 ] else [ u = i / (count - 1) ]
    append(out, [pathpointat(path, u), pathheadingat(path, u)])
  ]
  return out
]

export def fitpath(path, region, margin) [
  let sourcebox = bbox(path)
  let targetbox = bbox(region)
  let sourcew = sourcebox[2] - sourcebox[0]
  let sourceh = sourcebox[3] - sourcebox[1]
  let targetw = max(0, targetbox[2] - targetbox[0] - 2 * max(0, margin))
  let targeth = max(0, targetbox[3] - targetbox[1] - 2 * max(0, margin))
  let factor = 1
  let scaled = []
  let sourcecx = (sourcebox[0] + sourcebox[2]) / 2
  let sourcecy = (sourcebox[1] + sourcebox[3]) / 2
  let targetcx = (targetbox[0] + targetbox[2]) / 2
  let targetcy = (targetbox[1] + targetbox[3]) / 2
  if sourcew > 0 and sourceh > 0 [ factor = min(targetw / sourcew, targeth / sourceh) ]
  else if sourcew > 0 [ factor = targetw / sourcew ]
  else if sourceh > 0 [ factor = targeth / sourceh ]
  scaled = xscale(xlate(path, -sourcecx, -sourcecy), factor)
  return xlate(scaled, targetcx, targetcy)
]
`;
