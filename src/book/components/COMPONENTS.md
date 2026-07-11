# Book MDX Components

All components are globally injected by `MDXProvider` and available in every chapter file without imports.

---

## `Run`

Editable NeedleScript code cell with a live hoop preview.

```mdx
<Run>{`repeat 4 [ fd 20 rt 90 ]`}</Run>
```

| Prop           | Type        | Required | Default | Description                          |
| -------------- | ----------- | -------- | ------- | ------------------------------------ |
| `children`     | `ReactNode` | yes      | —       | NeedleScript source code             |
| `canvasHeight` | `number`    | no       | `280`   | Canvas preview height in pixels      |
| `autoRun`      | `boolean`   | no       | `true`  | Compile and display on initial mount |

---

## `RunLocked`

Read-only code cell with a live preview. An "Edit ✎" button replaces it with a full `Run` cell on demand.

```mdx
<RunLocked>{`repeat 4 [ fd 15 rt 90 ]`}</RunLocked>
```

| Prop           | Type        | Required | Default | Description                     |
| -------------- | ----------- | -------- | ------- | ------------------------------- |
| `children`     | `ReactNode` | yes      | —       | NeedleScript source code        |
| `canvasHeight` | `number`    | no       | `280`   | Canvas preview height in pixels |

---

## `Scrub`

Editable code cell with a stitch-by-stitch playback scrubber. Highlights the source line responsible for the current stitch position.

```mdx
<Scrub>{`repeat 6 [ fd 20 rt 60 ]`}</Scrub>
```

| Prop           | Type        | Required | Default | Description                     |
| -------------- | ----------- | -------- | ------- | ------------------------------- |
| `children`     | `ReactNode` | yes      | —       | NeedleScript source code        |
| `canvasHeight` | `number`    | no       | `280`   | Canvas preview height in pixels |

---

## `Quiz`

Inline multiple-choice question with instant feedback. Options lock after the first selection.

```mdx
<Quiz
  question="What does `repeat 4 [ fd 10 rt 90 ]` draw?"
  options={['A circle', 'A square', 'A triangle', 'Nothing']}
  answer={1}
  explanation="With 4 repetitions of 90° turns, the turtle traces a square."
/>
```

| Prop          | Type       | Required | Default | Description                             |
| ------------- | ---------- | -------- | ------- | --------------------------------------- |
| `question`    | `string`   | yes      | —       | Question text                           |
| `options`     | `string[]` | yes      | —       | Answer choices, labelled A., B., C., …  |
| `answer`      | `number`   | yes      | —       | 0-based index of the correct option     |
| `explanation` | `string`   | no       | —       | Text shown after any answer is selected |

---

## `Checkpoint`

End-of-chapter completion block. Persists completion state to `localStorage`; the sidebar reads it to display checkmarks.

```mdx
<Checkpoint chapterId="ch-0-5">Run the hexagon, then modify it to draw a square.</Checkpoint>
```

| Prop         | Type         | Required | Default | Description                                   |
| ------------ | ------------ | -------- | ------- | --------------------------------------------- |
| `chapterId`  | `string`     | yes      | —       | Unique chapter identifier, e.g. `"ch-0-5"`    |
| `children`   | `ReactNode`  | no       | —       | Task description shown inside the block       |
| `onComplete` | `() => void` | no       | —       | Callback fired when the reader marks complete |

---

## `Pitfall`

Warning callout for language pitfalls. Can carry an optional drill badge (`D1`–`D6`) to cross-reference recurring errors.

```mdx
<Pitfall drill="D1" title="Blocks use [ ], never { }">
  `repeat 6 { fd 20 rt 60 }` is a parse error. NeedleScript has no curly braces.
</Pitfall>
```

| Prop       | Type        | Required | Default | Description                                                               |
| ---------- | ----------- | -------- | ------- | ------------------------------------------------------------------------- |
| `title`    | `string`    | yes      | —       | Short pitfall title, displayed as "Pitfall: \<title\>"                    |
| `children` | `ReactNode` | yes      | —       | Explanation content                                                       |
| `drill`    | `string`    | no       | —       | Drill badge label, e.g. `"D1"`. Cross-references a recurring error drill. |
