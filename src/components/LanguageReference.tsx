import styles from './LanguageReference.module.css';

export default function LanguageReference() {
  return (
    <details className={styles.ref}>
      <summary>Language reference</summary>
      <div className={styles.refgrid}>
        <h3>Movement (mm · heading 0 = up, clockwise)</h3>
        <div><code>fd <i>n</i> · bk <i>n</i></code><span>sew forward / back; long moves auto-split at stitchlen</span></div>
        <div><code>rt <i>deg</i> · lt <i>deg</i></code><span>turn right / left</span></div>
        <div><code>arc <i>deg radius</i></code><span>sew along a circle: turn <i>deg</i> in total (negative = left) on a circle of <i>radius</i>; works with satin/bean too</span></div>
        <div><code>up · down</code><span>needle up = travel as jump · needle down = sew</span></div>
        <div><code>setxy <i>x y</i> · setx <i>x</i> · sety <i>y</i> · seth <i>deg</i> · home</code><span>position absolutely, set heading, return to 0 0</span></div>
        <div><code>push · pop</code><span>save the needle state (position, heading, pen) · jump back to it — branches without sewing back</span></div>

        <h3>Thread &amp; stitch quality</h3>
        <div><code>stitchlen <i>mm</i></code><span>running-stitch length, clamped 0.4–12 (default 2.5)</span></div>
        <div><code>satin <i>mm</i></code><span>zigzag column of this width; <code>satin 0</code> back to running</span></div>
        <div><code>bean <i>n</i></code><span>bold line: each stitch sewn <i>n</i> times (odd, e.g. 3); <code>bean 1</code> off</span></div>
        <div><code>estitch <i>mm</i></code><span>blanket stitch: prongs of this length on the left of travel, spaced by stitchlen; <code>estitch 0</code> off</span></div>
        <div><code>density <i>mm</i></code><span>satin penetration spacing (default 0.4)</span></div>
        <div><code>color <i>n</i> · stop</code><span>thread change (DST stop); <code>stop</code> = next color</span></div>
        <div><code>trim</code><span>cut thread here (before a long jump)</span></div>
        <div>
          <code>lock <i>mm</i></code>
          <span>
            tie-in/tie-off securing: 4 micro back-stitches sewn automatically wherever the thread
            starts or ends (design start/end, colour changes, trims, jumps ≥ 4 mm) so runs
            can't unravel. Size 0.3–1.5 (default 0.7, hidden under the stitching);{' '}
            <code>lock 0</code> off
          </span>
        </div>

        <h3>Fills</h3>
        <div>
          <code>beginfill … endfill</code>
          <span>
            moves between them trace a boundary instead of sewing; <code>endfill</code> sews a
            tatami fill. A pen-up move (<code>up … down</code>) starts a new ring — inner rings
            become holes (even-odd)
          </span>
        </div>
        <div><code>fillangle <i>deg</i></code><span>direction of the fill rows (default 0)</span></div>
        <div><code>fillspacing <i>mm</i></code><span>row spacing, 0.25–5 (default 0.4)</span></div>
        <div>
          <code>filllen <i>mm</i></code>
          <span>
            fill stitch length, 1–7; by default the fill follows <code>stitchlen</code> — set{' '}
            <code>filllen</code> to override, <code>filllen 0</code> to follow again. Rows are
            brick-offset
          </span>
        </div>

        <h3>Fabric &amp; professional quality</h3>
        <div>
          <code>fabric "woven · "knit · "stretch · "denim · "canvas · "fleece</code>
          <span>
            preset for the target fabric: sets pull compensation, automatic underlay, a density
            limit, and (knit/stretch) a lighter satin density. Explicit commands afterwards
            override it
          </span>
        </div>
        <div>
          <code>pullcomp <i>mm</i></code>
          <span>
            pull compensation 0–1.5: thread tension shrinks stitching along the stitch axis, so
            satin columns are widened and fill rows extended by this much to sew out at true size
          </span>
        </div>
        <div>
          <code>underlay "auto · "center · "edge · "zigzag · "off</code>
          <span>
            stabilising stitches sewn automatically <i>under</i> each satin column: a centre spine,
            edge runs, or a loose zigzag. <code>"auto</code> picks by width. Drawn thinner in the
            preview
          </span>
        </div>
        <div>
          <code>fillunderlay "auto · "tatami · "edge · "off</code>
          <span>
            underlay beneath fills: a sparse cross-grain tatami pass and/or an inset edge run so
            the topping doesn't shift or sink. <code>"auto</code> adds the edge run on large areas
          </span>
        </div>
        <div>
          <code>shortstitch <i>0/1</i></code>
          <span>
            curve physics (on by default): on tight satin curves the inner-edge penetrations bunch
            up and break thread — alternate inner stitches are automatically shortened
          </span>
        </div>
        <div>
          <code>autotrim <i>mm</i></code>
          <span>
            cut the thread automatically before any travel of this length or more (default 7) so
            connector threads can't snag; <code>autotrim 0</code> off
          </span>
        </div>
        <div>
          <code>maxdensity <i>n</i></code>
          <span>
            thread-coverage warning threshold in layers (default 3.5; fabric presets tune it —
            one layer ≈ a clean satin or fill). Stacking past it punches holes, breaks thread,
            and puckers — see the density heatmap toggle on the stage
          </span>
        </div>

        <h3>Control</h3>
        <div><code>repeat <i>n</i> [ … ]</code><span>loop; <code>repcount</code> is the 1-based counter</span></div>
        <div><code>while <i>cond</i> [ … ]</code><span>loop while the condition is true (non-zero)</span></div>
        <div><code>for i = <i>from</i> to <i>to</i> step <i>s</i> [ … ]</code><span>counted loop, inclusive; <code>step</code> optional (default 1, may be negative). Classic: <code>for "i <i>from to step</i> [ … ]</code></span></div>
        <div><code>if <i>cond</i> [ … ] else if <i>c2</i> [ … ] else [ … ]</code><span>compare with <code>&lt; &gt; = == &lt;= &gt;= !=</code>, combine with <code>and or not</code> (<code>!</code>); <code>true</code>/<code>false</code> are 1/0</span></div>
        <div><code>def <i>name</i>(a, b) [ … ]</code><span>define a procedure; classic: <code>to <i>name</i> :a :b … end</code></span></div>
        <div><code>return <i>expr</i> · return</code><span>return a value from a procedure (use it like <code>fd double(5)</code>) · leave early. Classic: <code>output</code> / <code>exit</code></span></div>
        <div><code>let x = <i>expr</i> · x = <i>expr</i> · x += <i>expr</i></code><span>declare (global at top level, local in a procedure) · assign · compound assign; read as <code>x</code>. Classic: <code>make "x <i>expr</i></code> / <code>local "x <i>expr</i></code> / <code>:x</code></span></div>
        <div><code>f(a, b) · f a b</code><span>call anything with parens (glued to the name: <code>fd(10)</code> calls, <code>fd (10)</code> groups) or classic prefix style — they mix freely</span></div>

        <h3>SVG import</h3>
        <div>
          <code>Import SVG / drop a file</code>
          <span>
            converts &lt;path&gt; (M L H V C S Q T A Z), rect, circle, ellipse, line, poly* +
            transforms into editable code. Filled shapes become beginfill blocks (subpaths become
            holes), stroked shapes become outlines, shapes with both get a procedure used for fill
            then border. Colours map to threads; text, images, gradients are skipped
          </span>
        </div>

        <h3>Values</h3>
        <div><code>random <i>n</i></code><span>0…n — reproducible; reseed with <code>seed <i>n</i></code></span></div>
        <div><code>noise <i>x</i> · noise2 <i>x y</i></code><span>smooth seeded noise 0…1 — sample slowly (e.g. <code>noise2 xcor / 18 ycor / 18</code>) for organic drift</span></div>
        <div><code>sin cos sqrt abs round mod</code><span>math (degrees); also <code>floor ceil min max pow</code> and the <code>%</code> operator (floor modulo, same as <code>mod</code>)</span></div>
        <div><code>atan <i>x y</i> · towards <i>x y</i> · distance <i>x y</i></code><span>heading of a vector · heading and distance from the needle to a point</span></div>
        <div><code>xcor ycor heading repcount</code><span>where the needle is right now</span></div>

        <h3>Generative math (a point is [x, y] · a path is a list of points · a region is a closed path)</h3>
        <div><code>lerp(a, b, t) · remap(v, ilo, ihi, olo, ohi) · clamp(v, lo, hi) · smoothstep(e0, e1, x)</code><span>the scalar utility belt — lerp/remap are unclamped</span></div>
        <div><code>gauss(mu, sigma)</code><span>seeded normal distribution (exactly 2 random draws)</span></div>
        <div><code>snoise2(x, y) · snoise3(x, y, z) · fbm2(x, y, octaves)</code><span>seeded simplex noise in <b>−1…1</b> (legacy <code>noise</code> stays 0…1); snoise3's <i>z</i> gives each motif its own field; fbm2 layers 1–8 octaves</span></div>
        <div><code>vadd vsub vscale vlerp vdot vlen vdist vnorm vrot vheading vfromheading</code><span>vector math on points; angles are turtle degrees (0 = up, clockwise) — <code>vrot(p, 90)</code> matches <code>rt 90</code>, <code>vfromheading(heading, 1)</code> is the needle's direction</span></div>
        <div><code>pathlen(p) · resample(p, mm) · chaikin(p, n) · catmull(pts, mm) · bezier(p0, c0, c1, p1, mm)</code><span>measure, restitch to even spacing, smooth corners, sample splines — all return paths</span></div>
        <div><code>centroid(p) · bbox(p)</code><span>centre point · [minx, miny, maxx, maxy]</span></div>
        <div><code>sewpath(<i>path</i>)</code><span>sew along a path — exactly <code>for p in path [ setpos(p) ]</code>, so pen state and satin apply</span></div>
        <div><code>scatter(mindist) · scatter(mindist, region)</code><span>seeded Poisson-disc points over the sewable field (or inside a region)</span></div>
        <div><code>voronoi(pts) · voronoi(pts, region) · triangulate(pts) · hull(pts) · relax(pts, n)</code><span>cells (one region per point, input order) · Delaunay triangles · convex hull · Lloyd's relaxation for even stippling</span></div>
        <div><code>offsetpath(region, mm)</code><span>inflate (+) or shrink (−) a region; returns a list of regions — shrinking may split a shape or erase it (empty list, loops just skip)</span></div>
        <div><code>clippaths(a, b, "union)</code><span>boolean of two regions: <code>"union "intersect "difference "xor</code>; returns a list of regions</span></div>
        <div><code>inpath(p, region)</code><span>1 if the point is inside (even-odd, like fills)</span></div>
        <div><code>shadowing</code><span>your own <code>def clamp(…)</code> wins over these library functions (one console note); core words like <code>fd</code> stay protected</span></div>

        <h3>Debugging</h3>
        <div><code>print <i>expr</i> · print "label <i>expr</i></code><span>log a value to the console, optionally with a label</span></div>
        <div><code>mark</code><span>drop a numbered pin on the preview at the needle — never exported to the machine</span></div>
        <div><code>assert <i>cond</i></code><span>stop with an error (and line number) if the condition is false</span></div>
        <div><code>playback scrubber</code><span>scrub or play the stitch sequence — the source line being sewn is highlighted in the editor</span></div>
        <div><code>// comment · # comment · ; comment</code><span>rest of line ignored (a lone <code>/</code> still divides)</span></div>
      </div>
    </details>
  );
}
