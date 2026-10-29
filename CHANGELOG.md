# Changelog

Notable changes to Aureka AbDraw. This project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html), and the format of this file
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.3.0] — 2026-10-29

### Added

- **Two 2+1 T-cell engager formats**, in a new *T-cell engagers* family: `2+1 TCB (CrossMab CH1-CL)`
  and `2+1 TCB (CrossMab VH-VL, charged)` — the cibisatamab and glofitamab geometries.
  Bivalent for the tumour antigen, monovalent for CD3, with the tumour Fab fused head-to-tail to
  the N-terminus of the CD3 CrossFab so the CD3 binder sits proximal to the hinge. Effector
  function silenced on both heavy chains. The library is now 45 formats across nine families.

## [1.2.2] — 2026-10-29

### Fixed

- **A linker between two Fabs stacked on the same arm is given room.** The spacing rule added in
  1.1.0 covered columns and C-terminal tails but not arms, so in a 2:1 TCB — a CrossFab fused
  N-terminally to another Fab — the connecting linker was squeezed into normal rung spacing and
  all but disappeared. Arms now open the same gap, and a test pins the case down.

## [1.2.1] — 2026-10-29

### Fixed

- Modification marks (`*`, `^`, `!`) are stacked above and below the domain label instead of
  beside it, so a domain carrying two of them no longer prints its glyphs over its own name.
  Charge marks sit closer to the pairing interface for the same reason.

## [1.2.0] — 2026-10-29

The drawing logic is now a module of its own, with tests that pin down the corrections so
they cannot quietly regress. No change to how any format renders.

### Changed

- **`src/engine.js` holds the parser, layout engine and renderer.** It touches no DOM and has
  no dependencies, so it runs in a browser as a plain script and under Node through `require()`.
  `src/ui.js` and `src/shell.html` carry the interface; `tools/build_app.py` assembles the
  single self-contained file from them and from `formats.json`.
- **The gallery renders without a browser.** `tools/render_gallery.js` calls the engine directly
  instead of driving Playwright, so a full rebuild is a fraction of a second.
- **One version number**, defined in the engine and written into the header at runtime.

### Added

- **`tests/engine.test.js`** — 19 checks, no dependencies, run with `node tests/engine.test.js`:
  every format parses and places each domain exactly once; hinge bonds are horizontal parallel
  rungs that cannot cross; the CH1–CL disulfide is off by default; linkers start at a
  C-terminus and end at an N-terminus; linker-joined domains are spaced far enough to show the
  connection; a declared length changes the curve but not its endpoints; a terminal hinge still
  renders; a C-terminal clasp is not mistaken for an Fc hinge; the grammar rejects what the
  specification forbids; AbML survives a parse/write round trip; exported SVG carries its
  provenance; and every drawing fits its viewBox.
- `defaultOptions()` on the engine, so callers get a complete option set without assembling one.

## [1.1.0] — 2026-10-29

Drawing corrections from review by Mandy, who checked the output against how these molecules
are actually built.

### Changed

- **Connectors are anchored at the chain termini.** A polypeptide now leaves a domain at its
  C-terminus and enters the next at its N-terminus, instead of running centre to centre. The
  linker in an scFv emerges below VH and arrives above VL, which is where it belongs.
- **Linkers follow the backbone.** The curve leaves along the C-terminal direction and arrives
  along the N-terminal one, so it never cuts across an antigen-binding end. Where the chain has
  to double back on itself, the path routes around the outside of the molecule rather than
  straight through it.
- **Domains joined by a linker are spaced apart**, so the linker is visible instead of being
  buried under two overlapping ellipses. Tandem VHH constructs were the worst case.
- **Hinge disulfides sit closer together**, as a tight parallel pair.
- **C-terminal fusions sit closer to the Fc**, which shortens the linker reaching them.

### Added

- **Every linker in the library declares its length**, and the drawn loop tightens or loosens
  with it. The 5-residue linker that forces a diabody to cross-pair now looks different from
  the 15-residue (G4S)3 of an scFv — which is most of what distinguishes those formats.
- Linker length labels are on by default.
- A short explanation of the Build tab and what `Renumber & auto-pair` is for.

## [1.0.0] — 2026-10-29

First tagged release. Nothing was released before this, so the commits preceding it are
development history rather than earlier versions.

### Added

- **AbML parser** covering the published grammar: 21 domain types across immunoglobulin and
  T-cell receptor families, domain identifiers and interactions, disulfide counts,
  specificities `.a`–`.h`, all seven modification symbols, and the comment keywords
  `ANTI`, `MOD`, `TYPE`, `LENGTH`, `CLASS`, `NOTE`, `ASEQ` and `DSEQ`.
- **`|[ADC]` pseudo-chain** for nonspecific conjugation, reported beside the figure.
- **Layout engine** that infers topology from the pairing graph — Y-shaped molecules with a
  hinge or an Fc core, Fab and Fv pairs, single-chain constructs, C-terminal fusions, and a
  column fallback for anything it does not recognise.
- **Renderer** producing vector SVG: domain ellipses with a notch at the antigen-binding end,
  a flat-based VHH, knobs drawn as protrusions and holes as countersinks, hinge crossings,
  linker arcs and disulfide bonds.
- **43-format library** in eight families, generated from scaffold builders in
  `tools/build_formats.py` rather than transcribed, and shipped as `formats.json`.
- **Structured chain builder** with `Renumber & auto-pair`, which allocates identifiers left to
  right and derives interactions from the architecture.
- **Panel figures** — several formats composed into a lettered grid, exported as one SVG.
- **Export** to SVG and 3× PNG, plus clipboard copy of the AbML and of the SVG markup. Every
  exported SVG carries the generating version and the AbML string in its metadata, so a figure
  can be traced back to its source expression.
- **Deep links**, e.g. `app/#crossmab-ch1-cl`.
- **Built-in syntax reference** under the Syntax tab.
- **Aureka figure conventions** — Times New Roman labels, transparent ground, and a palette on
  the Blues, Reds and Greys ramps, with every colour editable. An optional switch restores the
  published connector colours (dark green hinges, purple linkers).

### Drawing conventions

- **Interchain disulfides are parallel rungs**, one line per bond. A crossed depiction implies a
  cysteine bonded to two partners, which cannot happen.
- **The CH1–CL disulfide is off by default.** Drawn between two adjacent domains it reads as a
  bond between the domains themselves rather than between two cysteines; available as an option.
- **Linkers loop visibly**, routed to whichever side is clear of neighbouring domains, so the
  VH–VL connection in an scFv or a BiTE is explicit rather than hidden behind the ellipses.
- **A terminal hinge still renders**, so F(ab')2 keeps the hinge below its arms. A C-terminal
  clasp on two single-chain Fvs, as in DART, is correctly *not* treated as an Fc hinge.

### Validation

The parser rejects a domain carrying both a knob and a hole, or both charges; rejects `!`
outside CH2; and warns when a chain interacts with no other chain. A shared light chain is
written `VL.ab`, carrying both specificities, as the specification requires.

### Notes

Independent implementation of the AbML notation. Shares no code with the reference tool
abYdraw (GPL-3.0); see [NOTICE.md](NOTICE.md).
