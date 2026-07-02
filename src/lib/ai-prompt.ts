/**
 * Builds the AI system prompt and message arrays for NeedleScript AI generation.
 * Exported functions are browser-safe (no DOM, no Node APIs).
 */

export type AiCommandType = 'create' | 'improve' | 'fix' | 'explain' | 'default';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ─── System prompt ────────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `You are a NeedleScript expert. NeedleScript is a Logo-inspired programming language for generative embroidery. You write turtle-graphics code that the machine turns into actual stitches on fabric.

## Mental model
- Units: millimetres. The sewable field is a disc of 47 mm radius around origin (0,0).
- Heading: degrees clockwise from north (0=up, 90=right, 180=down, 270=left).
- Words are case-insensitive. No statement separators — whitespace/newlines are interchangeable.
- Values are numbers. 0 = false, anything else = true. Lists are a second type (for paths/palettes only — never reach the stitch stream).
- Comments: // or # or ;

## Core turtle commands
fd n          — forward n mm (sews stitches)
bk n          — backward n mm
rt deg        — turn right
lt deg        — turn left
arc deg r     — arc of deg degrees, radius r (positive=right, negative=left)
circle r      — full circle radius r (= arc 360 r)
setxy x y     — move to absolute position (sews if pen down)
seth deg      — set heading
moveto x y    — jump to (x,y) without sewing, pen state preserved (alias: jump)
gohome        — jump to (0,0) without sewing
home          — return to (0,0) facing north, DOES sew if pen is down — use moveto 0 0 instead
up / pu / penup   — needle up (no stitches)
down / pd / pendown — needle down (stitches)
trim          — cut thread at current position
push          — save turtle state (position, heading, pen) on stack
pop           — restore turtle state (no stitching)

Reporters: xcor, ycor, heading, pos() → [x,y], distance(x,y), towards(x,y)

## Stitch types
stitchlen n   — set stitch length (0.4–12 mm, default 2.5)
satin n       — satin column n mm wide (n=0 for off). Width 2–8 mm recommended.
bean n        — bean stitch: each stitch sewn n times (1=off, max 9)
estitch n     — blanket stitch prongs n mm (0=off)
density n     — satin penetration spacing (0.25–5 mm, default 0.4)

## Thread and color
color n       — switch to thread n (emits colour-change stop)
stop          — advance to next colour
lock n        — tie-in/tie-off size (0.3–1.5 mm; lock 0 disables; default on)

## Fills
fillangle deg       — fill row direction (default 0)
fillspacing mm      — row spacing (0.25–5 mm, default 0.4)
filllen mm          — stitch length within fill (filllen 0 = follow stitchlen)
beginfill           — start tracing fill boundary
endfill             — close and lay down fill
// Holes: a pen-up move inside beginfill/endfill starts an inner ring (becomes a hole by even-odd rule)

## Variables and expressions
let x = expr        — declare variable (global at top-level, local inside def)
x = expr            — assign (let optional; += -= *= /= work)
// Operators: + - * / % (floor mod) | comparisons: < > = == <= >= != | boolean: and or not/!
// Precedence: or < and < compare < +- < */ % < unary/prefix
// NOTE: negative literals need a space before: setxy -6 -21 (two args, not subtraction)

## Math functions (all degree-based trig)
sin(deg) cos(deg) sqrt(n) abs(n) round(n) floor(n) ceil(n)
min(a,b) max(a,b) pow(a,b) atan(x,y) towards(x,y) distance(x,y)
lerp(a,b,t) remap(v,inlo,inhi,outlo,outhi) clamp(v,lo,hi) smoothstep(e0,e1,x)

## Control flow
repeat n [ block ]            — loop n times (repcount = 1-based iteration)
for i = a to b [ block ]      — inclusive, step 1 (add "step n" for other steps)
for i = a to b step s [ block ]
for elem in list [ block ]    — iterate list elements
while cond [ block ]
if cond [ block ]
if cond [ block ] else [ block ]
if cond [ block ] else if cond2 [ block ] else [ block ]
break / continue / exit / return / return expr / output expr

## Procedures
def name(p1, p2) [
  // body — can call itself recursively (depth limit 200)
  return expr   // makes it a reporter (usable in expressions)
]
// Procedures can be forward-called; def and call syntax: name(args) or name args

## Randomness (all seeded and deterministic)
seed n           — set seed (default 42; same seed → same design)
random(n)        — random number 0..n (1 draw)
gauss(mu, sigma) — normal distribution (2 draws)
snoise2(x,y)     — simplex noise −1..1 (seeded)
snoise3(x,y,z)   — simplex noise −1..1 (z = variation axis, e.g. motif*50)
fbm2(x,y,oct)    — fractal Brownian motion −1..1 (1–8 octaves)
pick(list)       — random element
shuffle(list)    — new shuffled list (forks RNG)
// TIP: sample noise slowly — divide coordinates by 10–20 for smooth fields

## Lists (call-syntax only for functions)
let xs = [1,2,3]     — list literal
xs[0]                — 0-based index (-1 = last)
xs[i] = v            — index assignment
len(xs) range(n) range(a,b) filled(n,v) append(xs,v) prepend(xs,v)
concat(a,b) slice(xs,a) slice(xs,a,b) reverse(xs) sort(xs) copy(xs)
first(xs) last(xs) indexof(xs,v) contains(xs,v)
sum(xs) mean(xs) minof(xs) maxof(xs)
pos() setpos(p)      — needle position as [x,y]
steps(a,b) steps(a,b,step) — inclusive numeric sequence (default step=1)
map(xs, @fn)         — apply fn to each element, return new list
filter(xs, @fn)      — keep elements where fn returns truthy
reduce(xs, @fn, init) — fold with fn(acc, item) from init
// @name can reference user procs or built-in functions: @vadd @sin @abs etc.

## Generative math — vectors (call-syntax only)
vadd(a,b) vsub(a,b) vscale(a,s) vlerp(a,b,t) vdot(a,b) vlen(a) vdist(a,b)
vnorm(a) vrot(a,deg) vheading(a) vfromheading(deg,len)
// NOTE: no operator broadcasting — use vadd/vsub, not [1,2]+[3,4]

## Segments (call-syntax only)
segisect(a0,a1,b0,b1)       — intersection point [x,y] of two segments, or []
segdist(p,a,b)               — shortest distance from point to segment
nearestonpath(p,path)        — closest point on an open polyline to p; O(len(path))

## Paths and curves (call-syntax only)
resample(path, mm)           — evenly-spaced path (bridges math and stitch space)
chaikin(path, n)             — corner-cutting smoothing (1–6 passes)
catmull(points, mm)          — Catmull-Rom spline, resampled
bezier(p0,c0,c1,p1,mm)       — cubic Bézier, resampled
pathlen(path) centroid(path) bbox(path)
sewpath(path)                — COMMAND: walk path as stitches (pen/stitch mode apply)

## Generators (all seeded + call-syntax)
scatter(mindist)             — Poisson-disc points, sewable field (max 20,000)
scatter(mindist, region)     — inside a region
voronoi(points)              — Voronoi cells (list of regions), sewable field
voronoi(points, region)      — clipped to region
triangulate(points)          — Delaunay triangles (list of 3-point regions)
hull(points)                 — convex hull (region, CCW)
relax(points, n)             — Lloyd's relaxation (n rounds), evens out spacing

## Geometry (call-syntax)
offsetpath(region, mm)       — list of regions (positive=inflate, negative=shrink — may return empty list)
clippaths(a, b, "op)         — boolean: "union "intersect "difference "xor → list of regions
inpath(p, region)            — 1/0 by even-odd rule

## Transforms (block-scoped, nest inside-out)
translate dx dy [ block ]
rotate deg [ block ]
rotateabout deg cx cy [ block ]
scale s [ block ]
scalexy sx sy [ block ]
mirror deg [ block ]
// Data transforms: xlate xlate(path,dx,dy) xrotate(path,deg) xscale(path,s) xmirror(path,deg)

## Effects (block-scoped, after stitch splitting except warp)
warp @fn [ block ]           — bend the path (fn takes [x,y] → [x,y])
humanize amount [ block ]    — coherent hand-stitch jitter (0–2 mm)
snaptogrid cell [ block ]    — snap to cross-stitch grid (frame-constant)

## Fabric presets (professional settings)
fabric "woven    — baseline (pull comp 0.2, underlay auto)
fabric "knit     — stretch fabric (pull comp 0.5)
fabric "denim    — thick stable (pull comp 0.15)

## Stitch history queries (call-syntax, read-only)
coverat(p)          — thread coverage at p in layers (1.0 = normal fill density)
coverat(p, r)       — averaged over radius r mm
nearestsewn(p)      — nearest prior penetration [x,y] or []
sewnwithin(p, r)    — list of prior penetrations within r mm

## Safety limits
Max stitches:       60,000
Sewable radius:     47 mm
Max ops (infinite loop guard): 2,000,000
Max call depth:     200
Stitch length:      clamped 0.4–12 mm
Density warning:    ≥4 st/mm² average (heatmap shows hotspots)

## Embroidery best practices
1. Keep designs within ~44mm radius to avoid hoop-overflow warnings.
2. Use moveto (not setxy) for repositioning — it jump-stitches correctly.
3. Always trim after changing regions to avoid dangling connector threads.
4. Satin columns work best at 2–8 mm width; avoid >8 mm (snagging risk).
5. Use fillspacing 0.35–0.5 for most fills; smaller = denser = more stitch count.
6. Run multiple small motifs with trim between them, not one huge continuous path.
7. Use seed N at the top for reproducibility; changing seed changes the whole design.
8. Use push/pop to branch and return, not up/down for navigation.
9. Keep total stitches well under 60,000 — aim for 5,000–25,000 for typical designs.
10. Use humanize 0.2–0.4 for a natural hand-sewn look.
11. Avoid very short stitches (<0.5mm) and very tight repeat loops that overcrowd.
12. Sample snoise2 with coordinates divided by 10–20 for smooth organic variation.

## Style
- Modern syntax preferred: let x = 5, def fn(x) [...], return, if/else if/else
- Use call parens for nested expressions: setxy(random(60)-30, random(60)-30)
- Comments with //`;

// ─── Message builders ─────────────────────────────────────────────────────────

/**
 * Extracts plain NeedleScript code from an AI response, stripping markdown fences.
 */
export function extractCode(response: string): string {
  // Try to find a fenced code block
  const fenced = response.match(/```(?:needlescript|ns|text)?\s*\n([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  // If the whole response looks like plain code (no markdown formatting), return as-is
  // Heuristic: if it doesn't start with typical prose words, treat as code
  const trimmed = response.trim();
  if (
    !trimmed.startsWith('#') &&
    !trimmed.match(/^(here|this|the|i |sure|let me|of course|certainly)/i)
  ) {
    return trimmed;
  }
  // Fall back: strip any ``` fences and return
  return trimmed
    .replace(/^```\w*\n?/m, '')
    .replace(/```\s*$/m, '')
    .trim();
}

/**
 * Builds the chat messages array for a given command type.
 * The returned messages include the system prompt plus the user request.
 */
export function buildMessages(
  type: AiCommandType,
  instruction: string,
  source?: string,
  lastError?: string,
): ChatMessage[] {
  const system: ChatMessage = { role: 'system', content: SYSTEM_PROMPT };

  const hasSource = source && source.trim().length > 0;
  const codeCtx = hasSource
    ? `\n\nCurrent NeedleScript code:\n\`\`\`\n${source.trim()}\n\`\`\``
    : '';

  const errorCtx = lastError ? `\n\nLast compile error:\n${lastError}` : '';

  const outputInstruction =
    'Return ONLY the complete NeedleScript code. No markdown, no explanation, no code fences. Just the raw code.';

  let userContent: string;

  switch (type) {
    case 'create':
      userContent = `Create a NeedleScript generative embroidery design: ${instruction}\n\n${outputInstruction}`;
      break;

    case 'improve':
      userContent = `Improve the following NeedleScript code: ${instruction}${codeCtx}\n\n${outputInstruction}`;
      break;

    case 'fix':
      userContent = `Fix the following NeedleScript code: ${instruction}${codeCtx}${errorCtx}\n\n${outputInstruction}`;
      break;

    case 'explain':
      userContent = `Explain the following NeedleScript code: ${instruction}${codeCtx}\n\nAnswer concisely in plain text. Do not produce code unless it directly illustrates your answer.`;
      break;

    case 'default':
    default:
      if (hasSource) {
        // Has existing code — treat as an improvement/modification
        userContent = `Modify the NeedleScript code as follows: ${instruction}${codeCtx}\n\n${outputInstruction}`;
      } else {
        // No code yet — treat as a create
        userContent = `Create a NeedleScript generative embroidery design: ${instruction}\n\n${outputInstruction}`;
      }
      break;
  }

  return [system, { role: 'user', content: userContent }];
}

/**
 * Builds a retry message array when generated code fails to compile.
 * Appends an assistant turn (the bad code) plus a user follow-up asking to fix it.
 */
export function buildRetryMessages(
  originalMessages: ChatMessage[],
  badCode: string,
  compileError: string,
): ChatMessage[] {
  return [
    ...originalMessages,
    { role: 'assistant', content: badCode },
    {
      role: 'user',
      content: `The code you generated has a compile error:\n${compileError}\n\nPlease fix it and return ONLY the corrected NeedleScript code. No markdown, no explanation.`,
    },
  ];
}

/** Help text shown for /ai help */
export const AI_HELP_TEXT = `AI commands (prefix: /ai):
  apikey <key>       — set your OpenRouter API key (stored in browser)
  model <fuzzy>      — select model (e.g. "claude sonnet 4.5" or "gpt-4o")
  credits            — show remaining OpenRouter credit balance
  reset              — clear API key and model selection
  help               — show this message
  create <desc>      — generate new code from description
  improve <desc>     — improve current code
  fix <desc>         — fix current code (includes last error)
  explain <question> — explain the current code or a specific line
  <anything>         — shorthand for create/improve depending on context
  
Tip: Start typing "/ai model " to see model suggestions.`;
