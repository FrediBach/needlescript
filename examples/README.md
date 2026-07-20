# Playground examples

Examples are organized by the coding need they primarily demonstrate. The topic directory controls
their main picker group; secondary concepts are represented by catalogue tags.

| Directory    | Use for                                                                        |
| ------------ | ------------------------------------------------------------------------------ |
| `turtle`     | Movement, coordinates, transforms, and repeated motifs                         |
| `geometry`   | Points, paths, regions, clipping, offsets, and guides                          |
| `stitches`   | Running, bean, blanket, dashed, and decorative line work                       |
| `satin`      | Satin paths, rails, caps, corners, and wide columns                            |
| `fills`      | Tatami, hatching, contour, gradient, and programmable fills                    |
| `generative` | Seeded variation, noise, simulations, and mathematical curves                  |
| `language`   | Procedures, lists, recursion, higher-order code, and modules                   |
| `production` | Hoops, materials, underlay, appliqué, routing, preflight, and sew-out fixtures |

Every `.ns` file must have a matching entry in `src/example-catalog.ts` with a title, summary, kind,
and search tags. The filename without `.ns` is the stable example ID, so moving an example between
topics does not change shared links or stored playground state.

Choose one primary topic rather than creating nested directories. An example may teach several
things; put it where a user is most likely to start looking and add the remaining concepts as tags.

Kinds describe the example's purpose instead of its subjective difficulty:

- `recipe`: a focused implementation of one technique
- `sampler`: a comparison of several related techniques or settings
- `design`: a complete composition that combines several ideas
- `validation`: a diagnostic or repeatable physical sew-out fixture

Catalogue integrity is checked at startup and by tests. Missing files, missing metadata, duplicate
IDs, and a mismatch between the catalogue category and directory all fail loudly.
