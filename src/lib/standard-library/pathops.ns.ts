/** NeedleScript source for arc-length path queries and polyline operations. */
export const PATHOPS_SOURCE = `
def pointatdistance(path, dist) [
  if len(path) = 1 [ return copy(path[0]) ]
  let target = clamp(dist, 0, pathlen(path))
  let walked = 0
  let seglen = 0
  let answer = copy(path[len(path) - 1])
  let found = 0
  for i = 0 to len(path) - 2 [
    if found = 0 [
      seglen = vdist(path[i], path[i + 1])
      if walked + seglen >= target [
        if seglen < 0.000000001 [ answer = copy(path[i]) ]
        else [ answer = vlerp(path[i], path[i + 1], (target - walked) / seglen) ]
        found = 1
      ]
      walked += seglen
    ]
  ]
  return answer
]

export def pointat(path, t) [ return pointatdistance(path, clamp(t, 0, 1) * pathlen(path)) ]

export def headingat(path, t) [
  let target = clamp(t, 0, 1) * pathlen(path)
  let walked = 0
  let seglen = 0
  let answer = 0
  let found = 0
  for i = 0 to len(path) - 2 [
    if found = 0 [
      seglen = vdist(path[i], path[i + 1])
      if seglen > 0.000000001 [
        answer = vheading(vsub(path[i + 1], path[i]))
        if walked + seglen >= target [ found = 1 ]
      ]
      walked += seglen
    ]
  ]
  return answer
]

export def paramof(p, path) [
  let total = pathlen(path)
  let walked = 0
  let bestdist = 1000000000
  let bestalong = 0
  let delta = [0, 0]
  let rel = [0, 0]
  let seglen2 = 0
  let seglen = 0
  let u = 0
  let near = [0, 0]
  let d = 0
  for i = 0 to len(path) - 2 [
    delta = vsub(path[i + 1], path[i])
    rel = vsub(p, path[i])
    seglen2 = vdot(delta, delta)
    seglen = sqrt(seglen2)
    if seglen2 > 0.000000001 [ u = clamp(vdot(rel, delta) / seglen2, 0, 1) ] else [ u = 0 ]
    near = vlerp(path[i], path[i + 1], u)
    d = vdist(p, near)
    if d < bestdist [ bestdist = d bestalong = walked + u * seglen ]
    walked += seglen
  ]
  if total < 0.000000001 [ return 0 ] else [ return bestalong / total ]
]

export def subpath(path, t0, t1) [
  if t1 < t0 [ return reverse(subpath(path, t1, t0)) ]
  let lo = clamp(t0, 0, 1)
  let hi = clamp(t1, 0, 1)
  let total = pathlen(path)
  let out = [pointatdistance(path, lo * total)]
  let walked = 0
  for i = 0 to len(path) - 2 [
    walked += vdist(path[i], path[i + 1])
    if walked > lo * total and walked < hi * total [ append(out, copy(path[i + 1])) ]
  ]
  append(out, pointatdistance(path, hi * total))
  return out
]

export def dashes(path, onmm, offmm) [
  let out = []
  let total = pathlen(path)
  let cursor = 0
  let period = max(0.000001, onmm + offmm)
  while cursor < total [
    append(out, subpath(path, cursor / total, min(cursor + onmm, total) / total))
    cursor += period
  ]
  return out
]

def rdp(path, tol) [
  if len(path) <= 2 [ return copy(path) ]
  let faridx = -1
  let fardist = -1
  let d = 0
  for i = 1 to len(path) - 2 [
    d = segdist(path[i], path[0], path[len(path) - 1])
    if d > fardist [ fardist = d faridx = i ]
  ]
  if fardist <= tol [ return [copy(path[0]), copy(path[len(path) - 1])] ]
  let leftpart = rdp(slice(path, 0, faridx + 1), tol)
  let rightpart = rdp(slice(path, faridx), tol)
  return concat(slice(leftpart, 0, len(leftpart) - 1), rightpart)
]

export def simplifypath(path, tol) [ return rdp(path, max(0, tol)) ]

export def smoothclosed(ring, n) [
  let points = copy(ring)
  let passes = clamp(round(n), 0, 6)
  let out = []
  let count = 0
  let a = [0, 0]
  let b = [0, 0]
  if len(points) > 1 and points[0] = points[len(points) - 1] [ points = slice(points, 0, len(points) - 1) ]
  repeat passes [
    out = []
    count = len(points)
    for i = 0 to count - 1 [
      a = points[i]
      b = points[mod(i + 1, count)]
      append(out, vlerp(a, b, 0.25))
      append(out, vlerp(a, b, 0.75))
    ]
    points = out
  ]
  out = copy(points)
  if len(out) > 0 [ append(out, copy(out[0])) ]
  return out
]

export def morphpaths(a, b, t) [
  let closeda = len(a) > 1 and a[0] = a[len(a) - 1]
  let closedb = len(b) > 1 and b[0] = b[len(b) - 1]
  let count = max(len(a) - closeda, len(b) - closedb)
  let out = []
  let u = 0
  for i = 0 to count - 1 [
    if count = 1 [ u = 0 ] else [ u = i / (count - 1 + (closeda and closedb)) ]
    append(out, vlerp(pointat(a, u), pointat(b, u), t))
  ]
  if closeda and closedb and len(out) > 0 [ append(out, copy(out[0])) ]
  return out
]

export def pathisects(a, b) [
  let out = []
  let p = []
  for i = 0 to len(a) - 2 [
    for j = 0 to len(b) - 2 [
      p = segisect(a[i], a[i + 1], b[j], b[j + 1])
      if len(p) = 2 and contains(out, p) = 0 [ append(out, p) ]
    ]
  ]
  return out
]

def leftnormal(a, b) [
  let delta = vsub(b, a)
  let length = vlen(delta)
  if length < 0.000000001 [ return [0, 0] ] else [ return [-delta[1] / length, delta[0] / length] ]
]

export def offsetopen(path, mm) [
  if len(path) < 2 [ return copy(path) ]
  let out = []
  let prevn = [0, 0]
  let nextn = [0, 0]
  let bisect = [0, 0]
  let denom = 1
  for i = 0 to len(path) - 1 [
    if i = 0 [ prevn = leftnormal(path[0], path[1]) ] else [ prevn = leftnormal(path[i - 1], path[i]) ]
    if i = len(path) - 1 [ nextn = prevn ] else [ nextn = leftnormal(path[i], path[i + 1]) ]
    bisect = vadd(prevn, nextn)
    if vlen(bisect) < 0.000000001 [ bisect = nextn ] else [ bisect = vnorm(bisect) ]
    denom = vdot(bisect, nextn)
    if abs(denom) < 0.1 [ denom = 0.1 ]
    append(out, vadd(path[i], vscale(bisect, mm / denom)))
  ]
  return out
]
`;
