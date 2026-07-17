/** NeedleScript source for higher-level list operations. */
export const LISTX_SOURCE = `
export def sortby(xs, keyfn) [
  let vals = copy(xs)
  let keys = map(xs, keyfn)
  let count = len(vals)
  let best = 0
  let keytmp = 0
  let valtmp = 0
  for i = 0 to count - 2 [
    best = i
    for j = i + 1 to count - 1 [
      if keys[j] < keys[best] [ best = j ]
    ]
    if best != i [
      keytmp = removeat(keys, best)
      valtmp = removeat(vals, best)
      insertat(keys, i, keytmp)
      insertat(vals, i, valtmp)
    ]
  ]
  return vals
]

export def argmin(xs, keyfn) [
  let keys = map(xs, keyfn)
  let best = 0
  for i = 1 to len(xs) - 1 [ if keys[i] < keys[best] [ best = i ] ]
  return xs[best]
]

export def argmax(xs, keyfn) [
  let keys = map(xs, keyfn)
  let best = 0
  for i = 1 to len(xs) - 1 [ if keys[i] > keys[best] [ best = i ] ]
  return xs[best]
]

export def pairwise(xs) [
  let out = []
  for i = 0 to len(xs) - 2 [ append(out, [xs[i], xs[i + 1]]) ]
  return out
]

export def zip(a, b) [
  let out = []
  let count = min(len(a), len(b))
  for i = 0 to count - 1 [ append(out, [a[i], b[i]]) ]
  return out
]

def flatteninto(xs, out) [
  for x in xs [
    if islist(x) [ flatteninto(x, out) ] else [ append(out, x) ]
  ]
]

export def flatten(xs) [
  let out = []
  flatteninto(xs, out)
  return out
]

export def unique(xs) [
  let out = []
  for x in xs [ if contains(out, x) = 0 [ append(out, x) ] ]
  return out
]

export def chunk(xs, n) [
  let out = []
  let width = max(1, floor(n))
  let startidx = 0
  while startidx < len(xs) [
    append(out, slice(xs, startidx, min(startidx + width, len(xs))))
    startidx += width
  ]
  return out
]

export def rotatedlist(xs, n) [
  if len(xs) = 0 [ return [] ] else [
    let shift = mod(round(n), len(xs))
    return concat(slice(xs, shift), slice(xs, 0, shift))
  ]
]

export def countif(xs, predfn) [ return len(filter(xs, predfn)) ]
`;
