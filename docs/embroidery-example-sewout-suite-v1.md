# Embroidery example sew-out suite v1

Status: **software verified; physical results pending**. Blank observations are intentional and are
not evidence for changing material profiles or automatic compensation.

This suite covers the focused production examples added by Session 9.3. It complements
`physical-sewout-validation-v1.md`: that sheet measures calibration geometry across materials,
whereas this suite checks whether the documented construction techniques remain understandable,
exportable, and practical as complete small designs.

## Fixed software gate

All production examples use the `4x4` preset (100 × 100 mm hoop, 94 × 94 mm sewable field), declare
fabric, stabilizer, thread, needle, and topping assumptions in source, and must pass
`src/lib/__tests__/embroidery-example-sewout-suite.test.ts`. The fixture checks that each source:

- runs through the real parser, interpreter, machine, and post-process pipeline;
- contains stitches and stays within the common sewable field;
- has no error-severity structured preflight issue;
- retains its declared material intent; and
- produces non-empty DST, PES, and EXP data.

Passing those checks establishes software/export provenance only. It does not show that a design
has sewn successfully on a particular material or machine.

## Production specimen matrix

Keep authored scale and orientation. Equivalent unbranded materials may be substituted only when
the actual construction, weight, thread, needle point, stabilizer layers, and topping are recorded.

| ID  | Example source                                             | Intended observation                                    | Source assumptions                                       | State   |
| --- | ---------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------- | ------- |
| G02 | `examples/fills/gradientfill.ns`                           | two colors share one density-neutral candidate field    | woven / tearaway / polyester 40 wt / NM 75 / no topping  | pending |
| G03 | `examples/fills/gradientfill-n.ns`                         | three colors retain constant aggregate row pitch        | woven / tearaway / polyester 40 wt / NM 75 / no topping  | pending |
| K01 | `examples/production/knockdown-fleece.ns`                  | pile stays down beneath the smaller bordered patch      | fleece / cutaway / polyester 40 wt / NM 75 / topping     | pending |
| B01 | `examples/fills/fill-and-border.ns`                        | inset fill overlaps the satin border without a gap      | woven / tearaway / polyester 40 wt / NM 75 / no topping  | pending |
| C01 | `examples/satin/satin-cap-corner-sampler.ns`               | cap and sharp-join shapes remain distinct and stable    | woven / tearaway / polyester 40 wt / NM 75 / no topping  | pending |
| W01 | `examples/satin/wide-column-split-sampler.ns`              | shared seams interlock without a fixed dense ridge      | canvas / tearaway / polyester 40 wt / NM 90 / no topping | pending |
| T01 | `examples/production/constrained-travel-plan.ns`           | planned order respects atomics, barrier, and color      | woven / tearaway / polyester 40 wt / NM 75 / no topping  | pending |
| A01 | `examples/production/anisotropic-material-compensation.ns` | legacy/directional orientation pairs differ predictably | stretch / cutaway / polyester 40 wt / NM 75 / no topping | pending |

`examples/production/preflight-issue-sampler.ns` is excluded from this matrix by design. It contains
an unreachable penetration and is intentionally **not export-ready**. Its automated fixture must
continue to report an error-severity `hoop.unreachable` issue alongside advisory diagnostics.

## Sew-out protocol

1. Run `npm test -- src/lib/__tests__/embroidery-example-sewout-suite.test.ts` at the source commit
   used for export. Record that commit and the chosen file format.
2. Open the example without changing geometry, scale, rotation, construction settings, or planning
   mode. Changes to color alone are permitted when recorded.
3. Confirm the selected machine/transfer software reports a 100 × 100 mm hoop and does not apply
   automatic scaling, rotation, centering, stitch deletion, or path optimization.
4. Prepare the declared fabric, stabilizer, thread, needle, and topping. Record product-neutral
   construction details and any deviations before sewing.
5. Sew one specimen at a recorded speed. Stop and record thread breaks, needle deflection, hoop
   movement, fabric damage, or machine-side modification rather than silently restarting under the
   same specimen ID.
6. Remove the specimen, let it rest flat for at least 30 minutes, and record the observations below.

## Specimen record

Duplicate this block for each completed ID.

- Specimen ID: pending
- Sew date and operator: pending
- Source commit and example filename: pending
- Export format and conversion software/version: pending
- Machine manufacturer/model/firmware and speed: pending
- Hoop/frame and orientation: pending
- Fabric description, content, construction, weight, and lot: pending
- Stabilizer type, layers, weight, hooping method, and adhesive: pending
- Thread manufacturer/product, stated weight, color, and lot: pending
- Needle system, point style, manufacturer, and NM size: pending
- Topping type and removal method: pending
- Rest interval after hoop release: pending
- Thread breaks, interruptions, or machine-side changes: pending
- Intended observation result: pending
- Registration gaps/overlap, puckering, tunneling, sinking, ridges, or distortion: pending
- Overall pass/revise/do-not-sew decision: pending

No result in this document is currently eligible to change automatic profile behavior. Completed
records should be appended without rewriting the v1 sources; create a v2 suite for geometry or
protocol changes.
