import styles from '../ReferenceDialog.module.css';

export function AboutContent() {
  return (
    <div className={styles.about}>
      <h2 className={styles.aboutTitle}>NeedleScript</h2>
      <p className={styles.aboutPara}>
        NeedleScript is a Logo-inspired language for generative machine embroidery. Its turtle
        carries a needle: move it forward, turn it, repeat, and the resulting geometry becomes real
        stitches.
      </p>
      <p className={styles.aboutPara}>
        It combines classic turtle commands with fills, stitch-quality controls, seeded generative
        geometry, and export to machine-ready Tajima DST files.
      </p>
      <p className={styles.aboutCopyright}>© 2026 Fredi Bach</p>
    </div>
  );
}
