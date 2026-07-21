# PhysicsIntellisense Integrated Usability Protocol

Status: deferred to the PI-7 exit gate; no participant sessions recorded yet.

The product owner approved the PI-0 contract and prototype concept on 2026-07-21, allowing the
semantic engine work in PI-1 through PI-3 to begin. The mock preview overlays were difficult to
judge, so this broader protocol now runs against the integrated production editor/panel/stage
workflow in PI-7. It evaluates comprehension, navigation, and implemented overlay legibility rather
than detector accuracy.

Prototype:
[prototypes/physics-intellisense.html](./prototypes/physics-intellisense.html)

Implementation plan:
[physics-intellisense-implementation-plan.md](./physics-intellisense-implementation-plan.md)

## PI-7 acceptance gate

PI-7 may be marked complete only when:

1. Five representative participants can move from each assigned finding to its responsible source
   and stage location without moderator instruction.
2. All five interpret the clean state as “no modeled risks under current assumptions,” not a
   guarantee that the design will sew successfully.
3. The five review decisions at the end of this document are confirmed or explicitly amended from
   observed evidence.

When rehearsing with the prototype, remember that it uses mocked data. The formal PI-7 study must
use deterministic real-engine fixtures, and participant comments still do not validate physical
thresholds or predictions.

## Participant mix

Recruit five people across these profiles:

| Participant | Embroidery experience | Programming experience | Required perspective                      |
| ----------- | --------------------- | ---------------------- | ----------------------------------------- |
| P1          | Intermediate/advanced | Beginner               | Embroidery vocabulary and practical risk  |
| P2          | Intermediate/advanced | Beginner/intermediate  | Digitizing and machine workflow           |
| P3          | Intermediate          | Intermediate/advanced  | Combined mental model                     |
| P4          | Beginner              | Intermediate/advanced  | Code-navigation discoverability           |
| P5          | Beginner              | Beginner               | First-use language and disclosure clarity |

Participants do not need prior NeedleScript experience. Record only anonymized IDs and the two
experience bands.

## Session setup

- Duration: 25–35 minutes.
- Prefer a 13-inch-or-larger desktop display for tasks 1–3.
- Repeat the most difficult task once in the prototype's Mobile viewport.
- Start with the **Density hotspot** workflow and Physics tab selected.
- Do not explain blocker/risk/note, evidence labels, Locate, or Inspect sew order before the tasks.
- Ask the participant to think aloud. Avoid leading words such as “warning,” “heatmap,” “source
  line,” or “safe.”
- Record task completion, first click, wrong turns, time to locate, terminology questions, and
  confidence in the answer.

Opening statement:

> This is an early prototype for understanding physical embroidery risks in a code editor. The
> findings are prewritten and the controls simulate interaction. Please work with what is visible,
> think aloud, and tell me whenever the interface makes you guess.

## Task 1 — Density hotspot

Start state: **Density hotspot**, Desktop, Physics open.

Prompt:

> The design has a concentrated thread problem. Show me where it is in the design, which code
> contributes to it, and what you would try changing first.

Success requires:

- Selects “Thread coverage is concentrated here.”
- Identifies the outlined stage cell or repeated-hole rings.
- Reaches primary line 6 and recognizes lines 4–5 as contributors.
- States a construction remedy such as reducing overlap or increasing spacing.
- Does not propose disabling the limit as the first remedy.

Observe:

- Whether the participant starts from the card, code squiggle, or stage.
- Whether “4.8 layers · limit 3.5” is understood without opening details.
- Whether the temporary diagnostic overlay is mistaken for persistent heatmap state.
- Whether **Engine-derived** increases understanding or merely adds noise.

Follow-up:

> How certain does the interface seem that this will cause a bad sew-out?

A passing answer distinguishes a measured engine condition from a guaranteed physical failure.

## Task 2 — Fill/border and underlay construction

Switch to **Fill + underlay**.

Prompt:

> This motif has two construction problems around its edge. Explain the more important one and show
> how the foundation problem differs from the fill-and-border problem.

Success requires:

- Distinguishes the dense fill/border overlap from underlay protruding beyond topping.
- Uses the red band and blue dashed envelope to explain the difference.
- Finds the primary and related source lines.
- Suggests increasing **fillinset** for overlap and underlay inset/topping width for protrusion.

Observe:

- Whether grouping two related findings creates confusion.
- Whether “preferred ≤ 1.25 mm” is interpreted as a generic recommendation rather than a hard
  machine constraint.
- Whether primary, contributor, and related line language is understandable.
- Whether expanded evidence is needed before the participant can act.

Follow-up:

> Which part is measured, and which part is a recommendation?

## Task 3 — Machine-specific long jump

Switch to **Long jump**.

Prompt:

> Would this travel concern you on the selected machine? Show me when it occurs and what action you
> would consider.

Success requires:

- Identifies the 31.2 mm jump and the selected machine's preferred 12 mm maximum.
- Recognizes it as a risk rather than physical unreachability.
- Uses “Inspect sew order” to activate or confirm the playback interval.
- Suggests autotrim or an explicit trim.
- Understands that the machine profile is local context, not embedded portable source.

Observe:

- Whether Locate and Inspect sew order have distinct meanings.
- Whether the playback highlight is discoverable.
- Whether “Machine profile” reads as evidence or as a settings link.
- Whether the user expects ordinary selection to move playback.

## Task 4 — Blocker auto-open and stale/blocked states

Run these short probes:

1. Switch to **New blocker**.
2. Switch to **Stale result**.
3. Switch to **Invalid source**.

Ask:

- “Why did the panel open for the first state?”
- “Are the stale findings still about the source you are editing now?”
- “Does the invalid-source state mean Physics found no problems?”

Success requires:

- Interprets the blocker as physical unreachability and understands why it may auto-open.
- Understands stale results belong to the previous successful run.
- Does not interpret invalid source as a clean Physics result.
- Can distinguish compiler error priority from physical analysis.

Then select Mobile and ask the participant to use the collapsed, half-height, and full-height sheet
buttons. Record whether the sheet preserves enough editor/stage context to complete the hardest
earlier task.

## Task 5 — Clean-state comprehension

Switch to **Clean state**.

Prompt:

> What does this result tell you? Would you consider the design guaranteed to sew correctly?

Success requires both statements:

- No modeled risks were found under the displayed assumptions.
- A physical test sew-out is still recommended; absence of findings is not a guarantee.

Fail the clean-state acceptance criterion if the participant uses “safe,” “guaranteed,” “production
ready,” or equivalent language without immediately qualifying it.

## Post-session questions

Ask each on a five-point scale, then request a short explanation:

1. I could tell which finding needed attention first.
2. I could connect a finding to both code and embroidery geometry.
3. Measured values and thresholds were understandable.
4. Evidence labels helped me judge how much to trust a finding.
5. Locate and Inspect sew order behaved as I expected.
6. The clean state was appropriately cautious.
7. On mobile, the bottom sheet preserved enough context.

End with:

> What is the one thing you would change before relying on this while debugging an embroidery
> design?

## Result ledger

Use seconds for task time. “Locate” means the participant reached both source and stage without
instruction. “Clean” means they explicitly rejected a sew-out guarantee.

| ID  | Profile | T1 locate/time | T2 locate/time | T3 locate/time | Mobile pass | Clean pass | Key observation |
| --- | ------- | -------------- | -------------- | -------------- | ----------- | ---------- | --------------- |
| P1  | Pending | Pending        | Pending        | Pending        | Pending     | Pending    |                 |
| P2  | Pending | Pending        | Pending        | Pending        | Pending     | Pending    |                 |
| P3  | Pending | Pending        | Pending        | Pending        | Pending     | Pending    |                 |
| P4  | Pending | Pending        | Pending        | Pending        | Pending     | Pending    |                 |
| P5  | Pending | Pending        | Pending        | Pending        | Pending     | Pending    |                 |

## Observation log

Record behavioral evidence rather than proposed solutions.

| Participant | Task/state | Observed behavior | Moderator intervention | Candidate implication |
| ----------- | ---------- | ----------------- | ---------------------- | --------------------- |
|             |            |                   |                        |                       |

## Decision review

Complete after P5. A decision can be changed only with a recorded observation or repeated
comprehension failure.

| Decision                         | Prototype default                                           | Evidence after five sessions | Confirm/amend |
| -------------------------------- | ----------------------------------------------------------- | ---------------------------- | ------------- |
| Desktop information architecture | Console/Physics bottom-panel tabs                           | Pending                      | Pending       |
| Automatic opening                | First occurrence of a new blocker only                      | Pending                      | Pending       |
| Mobile information architecture  | Collapsed/half/full bottom sheet                            | Pending                      | Pending       |
| Evidence disclosure              | Label and measurement visible; method/provenance in details | Pending                      | Pending       |
| Clean-state language             | “No modeled risks” plus physical test sew-out caveat        | Pending                      | Pending       |

## PI-7 completion record

When the acceptance gate passes:

1. Fill the result ledger and decision review.
2. Summarize recurring failures and copy changes in the implementation plan.
3. Record the PI-7 completion date and close or explicitly accept PI-UX-001 and PI-UX-002 in the
   implementation plan.
4. Record any remaining UX risk against PI-8 or the PI-11 release gate.
5. Do not make the Physics tab default-on until unresolved findings are accepted in PI-11.
