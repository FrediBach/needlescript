# NeedleScript physical sew-out validation v1

Status: **awaiting physical measurements**. This document is a versioned protocol and result record;
blank measured fields are intentional and must not be interpreted as evidence.

Source: `examples/production/physical-sewout-validation-v1.ns`

This sheet evaluates the candidate directional compensation behavior introduced in Sessions 7.3–7.5.
It does not establish automatic material recommendations by itself. Do not change `FABRIC_PROFILES`,
enable non-zero push, or describe a value as sew-out-backed until completed specimen records are
committed here (or in a new version of this document).

## Fixed design and coordinate convention

- Source version: `physical-sewout-validation-v1`
- Hoop: 130 × 180 mm (5 × 7 inch class); keep the design at its authored scale and rotation.
- Grain/wale heading: hoop-space 0°, vertically upward. Hoop every specimen with its identified
  grain or wale parallel to that axis.
- Compensation mode: `directional`.
- Declared stretch: neutral (`fabricstretch 0 0`). The orientation targets measure physical
  anisotropy without presupposing it in the generator.
- Measurements: millimetres, taken after removing the specimen from the hoop and allowing it to rest
  flat for at least 30 minutes. Record a different interval when the material needs one.
- Measure the thread-covered outer edge unless a row below explicitly asks for a centerline or
  registration gap. Take three readings when an edge is irregular and record their mean plus range.

The source prints the sheet version followed by each target ID in sew order. Its three colors group
satin/corner targets, fills, and registration borders. Equivalent thread colors may be substituted,
but record them and retain contrast between fill and border.

## Target map and intended geometry

| Row in hoop | Left to right                                    |
| ----------- | ------------------------------------------------ |
| y = 70 mm   | S01, S02, S03 — horizontal satin                 |
| y = 47 mm   | S04, S05, S06 — vertical satin                   |
| y = 24 mm   | S07, S08, S09 — 45° diagonal satin               |
| y = 0 mm    | C01, C02, C03 — cornered satin                   |
| y = −30 mm  | F01, F02, F03, F04 — fills at 0°, 45°, 90°, 135° |
| y = −66 mm  | R01, R02 — fill-plus-border registration         |

| Target | Intended geometry                                              | Primary measurement                         |
| ------ | -------------------------------------------------------------- | ------------------------------------------- |
| S01    | 20.0 mm centerline, 1.5 mm authored width, heading 90°         | length × covered width                      |
| S02    | 20.0 mm centerline, 3.0 mm authored width, heading 90°         | length × covered width                      |
| S03    | 20.0 mm centerline, 6.0 mm authored width, heading 90°         | length × covered width                      |
| S04    | 20.0 mm centerline, 1.5 mm authored width, heading 0°          | length × covered width                      |
| S05    | 20.0 mm centerline, 3.0 mm authored width, heading 0°          | length × covered width                      |
| S06    | 20.0 mm centerline, 6.0 mm authored width, heading 0°          | length × covered width                      |
| S07    | 20.0 mm centerline, 1.5 mm authored width, heading 45°         | length × covered width                      |
| S08    | 20.0 mm centerline, 3.0 mm authored width, heading 45°         | length × covered width                      |
| S09    | 20.0 mm centerline, 6.0 mm authored width, heading 45°         | length × covered width                      |
| C01    | 3.0 mm satin; two 18.0 mm centerline legs; one 90° corner      | leg lengths, widths, corner distortion      |
| C02    | 6.0 mm satin; two 18.0 mm centerline legs; one 90° corner      | leg lengths, widths, corner distortion      |
| C03    | 3.0 mm satin; three 12.0 mm centerline legs; two 90° corners   | leg lengths, widths, accumulated distortion |
| F01    | 18.0 × 18.0 mm boundary; 0° rows; 0.4 mm inset                 | covered width × height                      |
| F02    | 18.0 × 18.0 mm boundary; 45° rows; 0.4 mm inset                | covered width × height                      |
| F03    | 18.0 × 18.0 mm boundary; 90° rows; 0.4 mm inset                | covered width × height                      |
| F04    | 18.0 × 18.0 mm boundary; 135° rows; 0.4 mm inset               | covered width × height                      |
| R01    | 24.0 × 24.0 mm boundary; 0° fill; 1.2 mm inset; 2.4 mm border  | gap/overlap on all four sides               |
| R02    | 24.0 × 24.0 mm boundary; 45° fill; 1.2 mm inset; 2.4 mm border | gap/overlap on all four sides               |

For R01/R02, record overlap as positive and a visible gap as negative. Measure at the midpoint of
each side after hoop release. Also note corner exposure, tunneling, puckering, rail spread, row-end
gaps, fabric show-through, thread sinking, needle damage, and design shift during sewing.

## Minimum specimen matrix

Use locally available unbranded material descriptions; do not infer a fabric class from appearance
alone. `D02` and `P01` are optional when canvas or pile fabric is unavailable. The controls
deliberately cover both 40 wt and 60 wt thread and NM 65, 75, and 90 needles without requiring a full
factorial experiment. The fixture test compiles every listed source setup and checks hoop
containment; this is software validation, not physical evidence.

| Specimen | Source setup                                            | Physical setup to record                | State            |
| -------- | ------------------------------------------------------- | --------------------------------------- | ---------------- |
| W01      | woven / polyester-40wt / NM 75 / tearaway / no topping  | stable woven baseline                   | pending          |
| K01      | knit / polyester-40wt / NM 75 / cutaway / no topping    | knit; identify construction and wale    | pending          |
| X01      | stretch / polyester-40wt / NM 75 / cutaway / no topping | stretch fabric; identify stretch axes   | pending          |
| D01      | denim / polyester-40wt / NM 90 / tearaway / no topping  | identify denim construction and weight  | pending          |
| D02      | canvas / polyester-40wt / NM 90 / tearaway / no topping | identify canvas construction and weight | pending/optional |
| P01      | fleece / polyester-40wt / NM 75 / cutaway / topping     | fleece/pile when available              | pending/optional |
| W02      | woven / rayon-60wt / NM 65 / tearaway / no topping      | same fabric lot as W01 when possible    | pending          |

The slash-separated values correspond to `sheet_fabric`, `sheet_thread`, `sheet_needle`,
`sheet_stabilizer`, and `sheet_topping` at the top of the source. Save the exported machine file with
the specimen ID and sheet version, for example `W01-physical-sewout-v1.dst`. Record any conversion
software; do not compensate by scaling in that software.

### Reproducible source and machine-file exports

Generate configured source copies plus DST, PES, and EXP files for the entire matrix:

```sh
npm run sewout:v1
```

The ignored output directory is `sewout-output/physical-sewout-v1`. Generate only one specimen and
machine format when appropriate:

```sh
npm run sewout:v1 -- --specimen W01 --format dst --out /path/to/sewout-artifacts
```

Every run writes the configured `.ns` file and `manifest.json`. The manifest records canonical and
configured source SHA-256 values, artifact checksums, material setup, event/stitch counts, and runtime
warnings. Existing artifacts are not replaced unless `--force` is explicit. Archive the manifest
with the physical specimen record and copy its machine-file checksum into the setup record below.
Checksums and successful software exports establish provenance only; they are not physical evidence.

### Expected warning ledger

A clean full-matrix generation must remain inside the 130 × 180 mm sewable field. The following
construction advisories are expected and are pinned by the fixture test:

| Specimen | Expected warning                                      | Rationale for retaining the target                                                                                                    |
| -------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| K01      | Two fill-boundary extension warnings at 0.50 mm pull  | The isolated F01/F03 targets deliberately expose row-end behavior beyond their 0.4 mm inset; they have no neighboring region or hole. |
| X01      | Four fill-boundary extension warnings at 0.60 mm pull | F01–F04 deliberately expose every required fill-row heading beyond the 0.4 mm inset; the extension remains isolated.                  |
| P01      | Fleece topping advisory                               | P01 already specifies topping; retain the general fabric advisory in the manifest as an operator check.                               |

These messages are not exporter failures and must remain in `manifest.json`. Any additional warning,
any hoop overflow, or a changed warning count requires review before sewing that artifact. Do not
silence the K01/X01 warnings by changing the v1 geometry: their purpose is to make the candidate
endpoint behavior measurable. Create v2 if the protocol changes.

### First physical run order

1. Start with W01 only and choose the machine's native format from its generated DST, PES, or EXP
   file. Confirm the machine or transfer software reports a 130 × 180 mm design field and three
   thread colors without applying scaling, rotation, centering offsets, or stitch optimization.
2. Match the selected file's SHA-256 value in `manifest.json`, then copy the checksum, machine,
   firmware, format, hoop, thread, needle, stabilizer, and intended speed into a new specimen setup
   record below.
3. Align the identified fabric grain with hoop-space 0° (vertical), hoop and stabilize consistently,
   and sew W01 at the recorded speed. Stop and record the event if thread breaks, the needle deflects,
   the hoop slips, or the machine modifies/rejects the file; do not silently restart under the same
   specimen ID.
4. Remove the specimen, let it rest flat for at least 30 minutes, complete every W01 measurement and
   observation, and retain the physical sample with its manifest.
5. Review W01 before proceeding in order through K01, X01, D01, optional D02/P01, and W02. A changed
   machine, speed, material lot, stabilizer setup, thread, or needle creates a new specimen record.

The repository cannot advance this section past W01 without the physical setup record and measured
values. Generated files, previews, and checksums are not substitutes for that handoff.

## Specimen setup record

Duplicate this section for every completed specimen. Do not collapse records that used different
machines, speeds, needles, stabilizer layers, or fabric lots.

- Specimen ID: pending
- Sew date and operator: pending
- Source commit: pending
- Export format and conversion software/version: pending
- Machine manufacturer/model/firmware: pending
- Machine speed (stitches/minute): pending
- Hoop/frame and orientation: pending
- Fabric preset used in source: pending
- Fabric physical description, fiber/content, construction, weight, and lot: pending
- Grain/wale identification method: pending
- Stabilizer category, layers, weight, hooping method, and adhesive: pending
- Topping type and removal method: pending
- Thread profile used in source: pending
- Thread manufacturer/product, fiber, stated weight, color, and lot: pending
- Needle system, point style, manufacturer, and NM size: pending
- Bobbin thread: pending
- Rest interval after hoop release: pending
- Ambient conditions when relevant: pending
- Machine-file checksum: pending
- General observations and interruptions: pending

## Post-release measurement record

Duplicate this table under each specimen setup record. `Measured A` and `Measured B` mean length and
covered width for satin, width and height for fills, and the named pair for corner targets. Use the
four side columns for registration targets and put extra readings/ranges in observations.

| Target | Intended A (mm) | Intended B (mm) | Measured A (mm) | Measured B (mm) | ΔA (mm) | ΔB (mm) | Observations |
| ------ | --------------: | --------------: | --------------: | --------------: | ------: | ------: | ------------ |
| S01    |            20.0 |             1.5 |               — |               — |       — |       — | pending      |
| S02    |            20.0 |             3.0 |               — |               — |       — |       — | pending      |
| S03    |            20.0 |             6.0 |               — |               — |       — |       — | pending      |
| S04    |            20.0 |             1.5 |               — |               — |       — |       — | pending      |
| S05    |            20.0 |             3.0 |               — |               — |       — |       — | pending      |
| S06    |            20.0 |             6.0 |               — |               — |       — |       — | pending      |
| S07    |            20.0 |             1.5 |               — |               — |       — |       — | pending      |
| S08    |            20.0 |             3.0 |               — |               — |       — |       — | pending      |
| S09    |            20.0 |             6.0 |               — |               — |       — |       — | pending      |
| C01    |        18.0 leg |       3.0 width |               — |               — |       — |       — | pending      |
| C02    |        18.0 leg |       6.0 width |               — |               — |       — |       — | pending      |
| C03    |        12.0 leg |       3.0 width |               — |               — |       — |       — | pending      |
| F01    |            18.0 |            18.0 |               — |               — |       — |       — | pending      |
| F02    |            18.0 |            18.0 |               — |               — |       — |       — | pending      |
| F03    |            18.0 |            18.0 |               — |               — |       — |       — | pending      |
| F04    |            18.0 |            18.0 |               — |               — |       — |       — | pending      |

| Target | Top overlap (mm) | Right overlap (mm) | Bottom overlap (mm) | Left overlap (mm) | Observations |
| ------ | ---------------: | -----------------: | ------------------: | ----------------: | ------------ |
| R01    |                — |                  — |                   — |                 — | pending      |
| R02    |                — |                  — |                   — |                 — | pending      |

## Evidence review and promotion gate

After all available specimens are measured:

1. Compare S01/S04/S07, S02/S05/S08, and S03/S06/S09 to separate orientation effects from width
   effects. Report raw values and within-specimen deltas; do not average unlike fabrics.
2. Compare F01–F04 for row-direction effects and R01/R02 for border overlap. Treat corner behavior
   separately from straight-column width.
3. Propose pull-across, fill-row-end, and push-along values separately, including sign, units,
   sample count, spread, and the specimen IDs that support each value.
4. Reject automatic promotion when the result depends on an unrecorded product, when specimens
   disagree materially, or when the sample count is insufficient. An explicit user-authored value
   may remain experimental with that limitation documented.
5. If recommendations change, create `physical-sewout-validation-v2` rather than rewriting this
   protocol or its completed measurements.

No recommendation has passed this gate in v1. Push remains zero and fabric directional defaults
remain neutral.
