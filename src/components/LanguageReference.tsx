import styles from './LanguageReference.module.css';

export default function LanguageReference() {
  return (
    <details className={styles.ref}>
      <summary>Language reference</summary>
      <div className={styles.refgrid}>
        <h3>Movement (mm · heading 0 = up, clockwise)</h3>
        <div><code>fd <i>n</i> · bk <i>n</i></code><span>sew forward / back; long moves auto-split at stitchlen</span></div>
        <div><code>rt <i>deg</i> · lt <i>deg</i></code><span>turn right / left</span></div>
        <div><code>up · down</code><span>needle up = travel as jump · needle down = sew</span></div>
        <div><code>setxy <i>x y</i> · seth <i>deg</i> · home</code><span>position absolutely, set heading, return to 0 0</span></div>

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

        <h3>Control</h3>
        <div><code>repeat <i>n</i> [ … ]</code><span>loop; <code>repcount</code> is the 1-based counter</span></div>
        <div><code>if <i>cond</i> [ … ] else [ … ]</code><span>compare with <code>&lt; &gt; =</code> (0 is false)</span></div>
        <div><code>to <i>name</i> :a :b … end</code><span>define a procedure with parameters</span></div>
        <div><code>make "x <i>expr</i> · :x</code><span>set and read variables</span></div>

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
        <div><code>sin cos sqrt abs round mod</code><span>math (degrees); also <code>xcor ycor heading</code></span></div>
        <div><code>print <i>expr</i> · ; comment</code><span>log a value to the console · rest of line ignored</span></div>
      </div>
    </details>
  );
}
