# AbML, as implemented by AbDraw

AbML describes an antibody-based molecule as a set of polypeptide chains, each a run of
domains. This page is a practical reference for the subset AbDraw parses — which is the
whole published grammar. For the notation's origin and rationale, see the paper cited in
[NOTICE.md](../NOTICE.md).

## Shape of an expression

```
chain | chain | chain
```

Chains are separated by `|`. Within a chain, domains are separated by `-` and read
N-terminus to C-terminus:

```
VH-CH1-H-CH2-CH3 | VL-CL
```

That is already a valid expression and draws a Fab arm on an Fc stem. Whitespace is
ignored, and domain types are case-insensitive.

## Domain types

| Token | Domain |
|---|---|
| `VH` `VL` | variable heavy, variable light |
| `CH1` `CH2` `CH3` `CH4` `CH5` | constant heavy |
| `CL` | constant light |
| `VHH` | camelid single variable domain |
| `H` | hinge — rendered as a connector, not an ellipse |
| `L` | linker — rendered as a curved connector |
| `X` | any other protein domain (zipper, fusion partner, receptor ectodomain) |
| `C` | chemical crosslinker |
| `VA` `CA` `VB` `CB` | T-cell receptor alpha and beta |
| `VG` `CG` `VD` `CD` | T-cell receptor gamma and delta |

## Qualifiers

Qualifiers attach to a domain in this order: modifications, specificity, identifier,
disulfides, comments.

```
VL*.a(6:1){1}[ANTI:HER2]
```

### Specificity — `.a` to `.h`

Marks which antigen a variable domain binds. AbDraw colours the molecule by specificity,
so `.a` and `.b` are what make the two arms of a bispecific different colours. A domain
that binds two antigens takes both letters: `VH.ab`.

Constant domains normally carry no specificity; they inherit the colour of the nearest
variable domain on the same chain.

### Identifier and pairing — `(n)` and `(n:m,...)`

Every domain may be numbered. A colon introduces the domains it is in contact with:

```
VH.a(1:6) ... VL.a(6:1)
```

Domain 1 pairs with domain 6, and vice versa. Pairings are what let the renderer work out
which chain is a light chain, where the Fc stem begins, and which domains sit side by side.
An expression with no identifiers still draws, but the layout will be a best guess.

The **Renumber & auto-pair** button in the tool rewrites identifiers left to right and
infers the pairings from the architecture, which is usually faster than numbering by hand.

### Disulfides — `{n}`

The number of disulfide bonds across a pairing, written on both partners:

```
CH1(2:7){1} ... CL(7:2){1}
H(3:10){2} ... H(10:3){2}
```

### Modifications

| Symbol | Meaning |
|---|---|
| `>` | knob |
| `@` | hole |
| `+` | positive charge for pairing |
| `_` | negative charge for pairing (underscore, since `-` joins domains) |
| `^` | conjugation site |
| `!` | aglycosyl CH2 |
| `*` | general modification, usually explained by a `MOD:` comment |

Modifications precede the specificity: `VH*+.a`, `CH3>(5:12)`.

AbDraw draws a knob as a bump protruding from the pairing interface and a hole as a
countersunk notch, so a knob-into-hole Fc is legible without labels.

### Comments — `[KEY:value]`

| Keyword | Use |
|---|---|
| `ANTI` | the antigen, free text |
| `MOD` | what a `*` modification is, from a controlled list |
| `TYPE` | what an `X` or `C` domain is (`ZIPPER`, `FUSION`, `OTHER`, crosslinker names) |
| `LENGTH` | length of a linker |
| `CLASS` | immunoglobulin class a domain came from |
| `NOTE` | anything else, free text; comes last |

Several comments can share one bracket, comma-separated, or sit in separate brackets:

```
VL*.a(1:3)[ANTI:CD3,MOD:PI]
VL*.a(1:3)[ANTI:CD3][MOD:PI]
```

Comments appear in a list beside the figure when **Comment list** is on.

## A complete example

Knob-into-hole bispecific IgG, two heavy and two light chains:

```
VH.a(1:6)-CH1(2:7){1}-H(3:10){2}-CH2(4:11)-CH3>(5:12)
| VL.a(6:1)-CL(7:2){1}
| VH.b(8:13)-CH1(9:14){1}-H(10:3){2}-CH2(11:4)-CH3@(12:5)
| VL.b(13:8)-CL(14:9){1}
```

Turning this into a CrossMab is a matter of exchanging domain types between the second
heavy and light chain — `CH1` and `CL` for a CrossMab<sup>CH1-CL</sup>, `VH` and `VL` for a
CrossMab<sup>VH-VL</sup>, both for a CrossMab<sup>Fab</sup>. The identifiers and pairings do
not change, which is precisely why the notation is useful for this family.

## What AbDraw does not do

- It does not infer a layout for every conceivable topology. Asymmetric constructs with
  more than four chains lay out legibly but may not match a hand-drawn cartoon.
- It does not model sequence. AbML describes architecture; residue-level annotation is out
  of scope.
- It does not reverse-engineer AbML from a drawing. Build chains in the **Build** tab
  instead, which writes the expression for you.
