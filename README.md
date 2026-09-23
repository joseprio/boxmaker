# BoxMaker

A 100% client-side generator for laser-cut boxes, in the spirit of MakerCase but built on the
geometry model of [boxes.py](https://github.com/florianfesti/boxes) by Florian Festi.

Everything — geometry, 3D preview, SVG/DXF export — happens in the browser. No server, no uploads.

**Use it online: [joseprio.github.io/boxmaker](https://joseprio.github.io/boxmaker/)**

## Features

- **Catalog with 3D previews.** Each generator is rendered from three angles at build-defaults;
  hover or tap the thumbnails to switch viewpoint.
- **Live 3D preview.** Every option applies immediately to a real assembled model — each part
  knows where it sits in 3D space, so you see the actual box, not an approximation.
- **Explode slider** to inspect how the parts fit together, plus a **sheet view** of the packed
  cutting layout.
- **SVG and DXF export** with kerf (burn) compensation. Engraving goes to its own red group / `ENGRAVE`
  layer; flex cuts are cut lines.
- **Floor thickness** (Universal, Closed, Open, Pen Holder and Magazine File): cut the floor from thicker
  or thinner material; the walls' bottom joints follow it.
- **One sheet per material thickness**: parts of different thicknesses are laid out and exported
  separately (`<box>-3mm.svg`, `<box>-6mm.svg`, ...).
- **Handles** (Universal, Closed and Open Box): a rounded handle hole per wall like boxes.py's Crate, with
  its own offset from the top, width, height and corner radius on each side.
- **Engraved rows** (Universal, Closed and Open Box): bands of a set width and spacing on the inside of
  two opposite walls, e.g. guides for CD storage.
- **Engraved numbers** (Hinge Card Box): single-line strokes for vector engraving or merged outlines for
  fill engraving, from a small built-in digit font.
- **Shareable URLs.** Every option is stored in the URL, so a configured box is a link.
- **Responsive.** Works on phones (stacked preview + options), tablets and desktop.

## Generators

| Generator | What it is |
| --- | --- |
| Universal Box | Open/closed/stackable box with flat, over-the-top or on-top lids and handles |
| Closed Box | Fully closed box; a building block to cut open yourself |
| Open Box | The simplest tray-like box |
| Type Tray | Grid of compartments with interlocking dividers and finger cut-outs |
| Divider Tray | Slotted side pieces holding removable (optionally leaning) dividers |
| Pen Holder Box | Two plates of pen holes, one under the rim and one lower down, with engraved cap rings |
| Tray Insert | Interlocking divider grid without floor or walls, to fit into an existing box |
| Card Box | Playing card box with a sliding lid and finger notches |
| Hinge Card Box | Card box with a separate lid on its own cabinet hinge for every deck; optional engraved numbers |
| Sliding Lid Box | Lid sliding in rails, with a grip hole or lip |
| Hinge Box | Lid on laser-cut cabinet hinges turning on a metal pin; optional split lid |
| Integrated Hinge Box | Lid pivoting on pins cut into its back wall, no hardware |
| Pirate Chest | Chest with a rounded lid of angled panels on integrated hinges |
| Side Hinge Box | Hidden hinges: an outer shell turns on two pins, opening the top and one end |
| Regular Box | Box with a regular polygon base (triangle → hexadecagon) |
| Angled Box | Elongated box with both ends cornered, angled finger joints |
| Rounded Box | Rounded vertical edges: a flex wall wraps round the floor and top, optional shelves and lid |
| Flex Box | Living-hinge box whose wall wraps round to form the lid, closed with a latch |
| Display Shelf | Slanted shelves with front lips and dividers |
| Stackable Bin | Open bin with a slanted front that stacks on its siblings |
| Magazine File | Tall at the back, low at the front, sides curving between; optional wall mounting holes |
| Bin Tray | Wall-mounted upright type tray with sloped retainers and keyhole mounts |
| Uneven Height Box | Different height at each corner, with a matching lid |
| Skådis Pegboard | IKEA Skådis-style pegboard (staggered slots on a 20 mm grid) with spacer washers |
| Skådis Stand | Legs that let a Skådis pegboard stand on its own, hooked into its slots; optional front feet |

## Development

```bash
npm install
npm run dev      # dev server
npm test         # geometry tests
npm run build    # static build into dist/
```

The build output in `dist/` is fully static — drop it on any static host. `base` is set to `./`
and routing uses hash URLs, so it also works from a subdirectory or from `file://`.

The app's page is `app.html` (the dev server opens it); the build writes it as `dist/index.html`.
`dist/` is committed and served by GitHub Pages at `/dist/`, with the root `index.html` redirecting
there (keeping `#/box/...` links), so **run `npm run build` and commit `dist/` before pushing** to
update the live site.

## How it works

`src/engine/` is a TypeScript port of the parts of boxes.py that matter for box generation:

- `turtle.ts` — the turtle-graphics drawing context (move, edge, corner/arc), mirroring the
  cairo-based one upstream.
- `edges.ts` — edge types: finger joints and their counterparts, finger holes, stackable feet,
  slotted and compound edges, grip cut-outs. The finger-count and finger-length maths is a direct
  port, so joints match upstream output.
- `boxes.ts` — the `Boxes` base class: `rectangularWall`, `trapezoidWall`, `polygonWall`,
  `regularPolygonWall`, holes, and the sizing helpers (`adjustSize`).
- `lids.ts` — the lid styles and handles from `boxes/lids.py`.
- Flex (living hinge) cuts, dove tails, `roundedPlate` and `surroundingWall` for walls that wrap
  round rounded plates. Flex cuts are open cut lines (`Part.cuts`), exported with the contours.
- Chest hinges (integrated pins) and cabinet hinges (separate eyes). Hinged generators take a
  "lid open" angle that only rotates the lid in the preview (`rotatePlacement`).
- `layout.ts` / `export.ts` — shelf packing of the parts plus SVG/DXF writers.

The one real addition over upstream is **placement**: each part carries an optional origin and two
basis vectors saying where it sits in box space. That is what makes the 3D preview exact rather
than inferred — the viewer extrudes each part's outline by the material thickness and puts it
where the generator said it goes. Flex walls carry a bend path (straight runs and arcs) in their
placement; the viewer slices their mesh across each bend and wraps it along the path.

Generators live in `src/generators/` and are plain data: a list of parameter groups plus a `build`
function that returns parts. Adding one means adding a file and an entry in `src/generators/index.ts`.

## Licence

The geometry engine is derived from boxes.py, which is GPL-3.0. This project is therefore also
GPL-3.0.
