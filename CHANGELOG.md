# Changelog

Notable changes to Aureka AbDraw. This project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html), and the format of this file
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
