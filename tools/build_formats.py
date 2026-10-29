#!/usr/bin/env python3
"""
Generate the Aureka AbDraw format library.

Every entry is assembled here from the published molecular architecture of the
format, using scaffold builders defined in this file. Domain identifiers are
allocated left to right and interactions are derived from the explicit pairing
list, so the strings are produced mechanically rather than transcribed.
"""
import json, re

# --------------------------------------------------------------------------
# scaffold builders
# --------------------------------------------------------------------------
def arm(tag, spec, hv='VH', hc='CH1', lv='VL', lc='CL', hmods='', lmods='', hvmods='', lvmods='', ss_c=1, lspec=None, hcmt='', lcmt=''):
    """One Fab arm. Returns (heavy_domains, light_chain, pairs).
       hv/hc ride the heavy chain; lv/lc ride the light chain, so swapping the
       arguments is exactly what a CrossMab does."""
    ls = lspec or spec
    H = [f'{hv}{hvmods}.{spec}#{tag}hv', f'{hc}{hmods}#{tag}hc' + (f'[{hcmt}]' if hcmt else '')]
    L = [f'{lv}{lvmods}.{ls}#{tag}lv', f'{lc}{lmods}#{tag}lc' + (f'[{lcmt}]' if lcmt else '')]
    P = [(f'{tag}hv', f'{tag}lv', 0), (f'{tag}hc', f'{tag}lc', ss_c)]
    return H, L, P

def fc(tag, ch3mods='', hinge=True, ch2mods=''):
    d = []
    if hinge: d.append(f'H#{tag}h')
    d += [f'CH2{ch2mods}#{tag}g2', f'CH3{ch3mods}#{tag}g3']
    return d

def fc_pairs(t1, t2, hinge=True, hss=2):
    p = [(f'{t1}g2', f'{t2}g2', 0), (f'{t1}g3', f'{t2}g3', 0)]
    if hinge: p.insert(0, (f'{t1}h', f'{t2}h', hss))
    return p

def scfv(tag, spec, order='HL', length=15):
    """single-chain Fv as a domain run with its internal linker.
       15 residues ((G4S)3) lets VH and VL fold back on each other; shortening it is what
       forces the cross-pairing that distinguishes a diabody from an scFv."""
    lk = f'L#{tag}l[LENGTH:{length}]'
    if order == 'HL':
        return [f'VH.{spec}#{tag}vh', lk, f'VL.{spec}#{tag}vl'], [(f'{tag}vh', f'{tag}vl', 0)]
    return [f'VL.{spec}#{tag}vl', lk, f'VH.{spec}#{tag}vh'], [(f'{tag}vh', f'{tag}vl', 0)]

def igg(a='a', b=None, knob=True, **kw):
    """Symmetric IgG when b is None, asymmetric knob-into-hole bispecific otherwise."""
    b = b or a
    H1, L1, P1 = arm('p', a, **kw.get('arm1', {}))
    H2, L2, P2 = arm('q', b, **kw.get('arm2', {}))
    k1 = '>' if (knob and b != a) else ''
    k2 = '@' if (knob and b != a) else ''
    c1 = H1 + fc('p', ch3mods=k1)
    c2 = H2 + fc('q', ch3mods=k2)
    return {'chains': [c1, L1, c2, L2], 'pairs': P1 + P2 + fc_pairs('p', 'q')}

# --------------------------------------------------------------------------
# serialiser: allocate ids left to right, then write the interactions
# --------------------------------------------------------------------------
TOK = re.compile(r'^([A-Za-z0-9]+?)([*>@+_!^]*)(?:\.([a-h]+))?#(\w+)(?:\[(.*)\])?$')

def emit(spec):
    chains, pairs = spec['chains'], spec['pairs']
    ids, parsed = {}, []
    n = 1
    for ch in chains:
        row = []
        for tok in ch:
            m = TOK.match(tok)
            if not m: raise ValueError('bad token: ' + tok)
            typ, mods, sp, key, cmt = m.groups()
            if key in ids: raise ValueError('duplicate key: ' + key)
            ids[key] = n
            row.append({'t': typ, 'm': mods or '', 's': sp or '', 'k': key,
                        'id': n, 'p': [], 'ss': 0, 'c': cmt or ''})
            n += 1
        parsed.append(row)
    flat = {d['k']: d for r in parsed for d in r}
    for k1, k2, ss in pairs:
        if k1 not in flat or k2 not in flat: raise ValueError(f'unknown pair {k1}:{k2}')
        a, b = flat[k1], flat[k2]
        if b['id'] not in a['p']: a['p'].append(b['id'])
        if a['id'] not in b['p']: b['p'].append(a['id'])
        if ss: a['ss'] = b['ss'] = ss
    out = []
    for r in parsed:
        toks = []
        for d in r:
            s = d['t'] + d['m'] + (('.' + d['s']) if d['s'] else '') + '(' + str(d['id'])
            if d['p']: s += ':' + ','.join(str(x) for x in d['p'])
            s += ')'
            if d['ss']: s += '{%d}' % d['ss']
            if d['c']: s += '[' + d['c'] + ']'
            toks.append(s)
        out.append('-'.join(toks))
    return '|'.join(out)

# --------------------------------------------------------------------------
# the library
# --------------------------------------------------------------------------
FORMATS = []
def F(name, cat, desc, spec):
    FORMATS.append({'name': name, 'category': cat, 'description': desc, 'abml': emit(spec)})

# ---- Fragments -----------------------------------------------------------
F('Fv', 'Fragments', 'The minimal antigen-binding unit: a VH–VL heterodimer with no constant domains.',
  {'chains': [['VH.a#vh'], ['VL.a#vl']], 'pairs': [('vh','vl',0)]})

_d, _p = scfv('s','a')
F('scFv', 'Fragments', 'VH and VL carried on one polypeptide and held together by a flexible linker.',
  {'chains': [_d], 'pairs': _p})

_H,_L,_P = arm('f','a')
F('Fab', 'Fragments', 'Heavy-chain Fd (VH–CH1) disulfide-bonded to a complete light chain.',
  {'chains': [_H,_L], 'pairs': _P})

_H1,_L1,_P1 = arm('p','a'); _H2,_L2,_P2 = arm('q','a')
F("F(ab')2", 'Fragments', 'Two Fab arms held together by the hinge disulfides, with no Fc.',
  {'chains': [_H1+['H#ph'], _L1, _H2+['H#qh'], _L2], 'pairs': _P1+_P2+[('ph','qh',2)]})

F('VHH (nanobody)', 'Fragments', 'A single camelid heavy-chain variable domain that binds without a light chain.',
  {'chains': [['VHH.a#v']], 'pairs': []})

F('Biparatopic VHH', 'Fragments', 'Two VHH domains in tandem, each raised against a different epitope on one target.',
  {'chains': [['VHH.a#v1','L#l1[LENGTH:15]','VHH.b#v2']], 'pairs': []})

F('Trivalent VHH', 'Fragments', 'Three linked VHH domains giving three binding specificities on one short chain.',
  {'chains': [['VHH.a#v1','L#l1[LENGTH:15]','VHH.b#v2','L#l2[LENGTH:15]','VHH.c#v3']], 'pairs': []})

# ---- Canonical -----------------------------------------------------------
F('IgG1', 'Canonical', 'The parental monospecific, bivalent antibody that every format below modifies.', igg('a'))

F('Fc', 'Canonical', 'The hinge–CH2–CH3 homodimer on its own, the effector and half-life module.',
  {'chains': [fc('p'), fc('q')], 'pairs': fc_pairs('p','q')})

F('One-armed IgG', 'Canonical', 'Monovalent IgG: one Fab arm, a bare knob-into-hole Fc on the other side.',
  (lambda H,L,P: {'chains': [H+fc('p', ch3mods='>'), L, fc('q', ch3mods='@')],
                  'pairs': P+fc_pairs('p','q')})(*arm('p','a')))

# ---- Asymmetric bispecific IgG ------------------------------------------
F('Knob-into-hole', 'Asymmetric bispecific IgG',
  'Reciprocal CH3 steric mutations drive heterodimerisation of two different heavy chains.',
  igg('a','b'))

F('Common light chain', 'Asymmetric bispecific IgG',
  'Both arms share one light chain, so only heavy-chain pairing has to be engineered. '
  'The shared chain carries both specificities, per the AbML convention.',
  igg('a','b', arm1={'lspec':'ab'}, arm2={'lspec':'ab'}))

F('CrossMab CH1-CL', 'Asymmetric bispecific IgG',
  'CH1 and CL are exchanged in one arm, so the wrong light chain can no longer pair.',
  igg('a','b', arm2={'hc':'CL','lc':'CH1'}))

F('CrossMab VH-VL', 'Asymmetric bispecific IgG',
  'VH and VL are exchanged in one arm, keeping the constant-domain interface untouched.',
  igg('a','b', arm2={'hv':'VL','lv':'VH'}))

F('CrossMab Fab', 'Asymmetric bispecific IgG',
  'The whole Fab is swapped in one arm — both the variable and the constant pair cross over.',
  igg('a','b', arm2={'hv':'VL','hc':'CL','lv':'VH','lc':'CH1'}))

F('Orthogonal Fab', 'Asymmetric bispecific IgG',
  'Complementary charge and steric mutations across both Fab interfaces enforce correct pairing.',
  igg('a','b', arm2={'hvmods':'*+','lvmods':'*_','hmods':'*>','lmods':'*@'}))

F('Charge-pair bispecific', 'Asymmetric bispecific IgG',
  'Electrostatic steering: opposing charges at the CH3 and CH1/CL interfaces instead of knobs.',
  (lambda: (lambda a1,a2: {
      'chains': [a1[0] + fc('p', ch3mods='*+'), a1[1], a2[0] + fc('q', ch3mods='*_'), a2[1]],
      'pairs': a1[2] + a2[2] + fc_pairs('p','q')})(
      arm('p','a', hmods='*+', lmods='*_'), arm('q','b', hmods='*_', lmods='*+')))())

F('DuetMab', 'Asymmetric bispecific IgG',
  'Knob-into-hole plus an engineered CH1–CL disulfide replacing the native one in one arm.',
  igg('a','b', arm2={'hmods':'*','lmods':'*','hcmt':'MOD:DISULFIDE','lcmt':'MOD:DISULFIDE'}))

F('kappa-lambda body', 'Asymmetric bispecific IgG',
  'One common heavy chain pairs with a kappa and a lambda light chain, giving two specificities.',
  igg('a','a', arm2={'lspec':'b','lcmt':'NOTE:lambda'}, arm1={'lcmt':'NOTE:kappa'}))

# ---- Appended IgG --------------------------------------------------------
def _dvd(tag, inner, outer):
    H = [f'VH.{outer}#{tag}ov', f'L#{tag}ol[LENGTH:6]', f'VH.{inner}#{tag}iv', f'CH1#{tag}hc']
    L = [f'VL.{outer}#{tag}olv', f'L#{tag}oll[LENGTH:6]', f'VL.{inner}#{tag}ilv', f'CL#{tag}lc']
    P = [(f'{tag}ov', f'{tag}olv', 0), (f'{tag}iv', f'{tag}ilv', 0), (f'{tag}hc', f'{tag}lc', 1)]
    return H, L, P
_H1,_L1,_P1 = _dvd('p','a','b'); _H2,_L2,_P2 = _dvd('q','a','b')
F('DVD-Ig', 'Appended IgG',
  'A second variable domain stacked N-terminal to each native one: tetravalent and bispecific.',
  {'chains': [_H1+fc('p'), _L1, _H2+fc('q'), _L2], 'pairs': _P1+_P2+fc_pairs('p','q')})

def _igg_append(tag_app, spec_app, where):
    """IgG with an scFv appended to each heavy-chain or light-chain C-terminus."""
    H1,L1,P1 = arm('p','a'); H2,L2,P2 = arm('q','a')
    s1,sp1 = scfv('r', spec_app); s2,sp2 = scfv('t', spec_app)
    if where == 'H':
        c1 = H1 + fc('p') + ['L#rlk[LENGTH:15]'] + s1
        c2 = H2 + fc('q') + ['L#tlk[LENGTH:15]'] + s2
        return {'chains': [c1, L1, c2, L2], 'pairs': P1+P2+fc_pairs('p','q')+sp1+sp2}
    c1 = H1 + fc('p'); c2 = H2 + fc('q')
    return {'chains': [c1, L1 + ['L#rlk[LENGTH:15]'] + s1, c2, L2 + ['L#tlk[LENGTH:15]'] + s2],
            'pairs': P1+P2+fc_pairs('p','q')+sp1+sp2}

F('IgG-scFv (heavy C-term)', 'Appended IgG',
  'An scFv fused to each heavy-chain C-terminus — tetravalent, bispecific, symmetric.',
  _igg_append('r','b','H'))
F('IgG-scFv (light C-term)', 'Appended IgG',
  'The same idea with the scFv hung off each light-chain C-terminus instead.',
  _igg_append('r','b','L'))

_H1,_L1,_P1 = arm('p','a'); _H2,_L2,_P2 = arm('q','a')
_s1,_sp1 = scfv('r','b'); _s2,_sp2 = scfv('t','b')
F('scFv-IgG (heavy N-term)', 'Appended IgG',
  'An scFv placed ahead of each VH, so the second specificity sits at the tip of the arm.',
  {'chains': [_s1+['L#rlk[LENGTH:15]']+_H1+fc('p'), _L1, _s2+['L#tlk[LENGTH:15]']+_H2+fc('q'), _L2],
   'pairs': _P1+_P2+fc_pairs('p','q')+_sp1+_sp2})

_H1,_L1,_P1 = arm('p','a'); _H2,_L2,_P2 = arm('q','a')
F('IgG-VHH', 'Appended IgG',
  'A single VHH domain on each heavy-chain C-terminus — the smallest symmetric append.',
  {'chains': [_H1+fc('p')+['L#rl[LENGTH:15]','VHH.b#rv'], _L1, _H2+fc('q')+['L#tl[LENGTH:15]','VHH.b#tv'], _L2],
   'pairs': _P1+_P2+fc_pairs('p','q')})

F('Two-in-one Fab (DAF)', 'Appended IgG',
  'One paratope engineered to bind two antigens, so the molecule stays a plain IgG.',
  igg('ab'))

_H1,_L1,_P1 = arm('p','a', hmods='^', hcmt='MOD:CONJUGATION')
_H2,_L2,_P2 = arm('q','a', hmods='^', hcmt='MOD:CONJUGATION')
F('ADC (site-specific)', 'Appended IgG',
  'An IgG carrying defined conjugation sites for a cytotoxic payload.',
  {'chains': [_H1+fc('p'), _L1, _H2+fc('q'), _L2], 'pairs': _P1+_P2+fc_pairs('p','q')})

# ---- Fragment bispecifics ------------------------------------------------
_a,_pa = scfv('x','a'); _b,_pb = scfv('y','b')
F('BiTE (tandem scFv)', 'Fragment bispecifics',
  'Two scFvs in tandem on one chain — the T-cell engager archetype, no Fc at all.',
  {'chains': [_a + ['L#mid[LENGTH:5]'] + _b], 'pairs': _pa+_pb})

F('Diabody', 'Fragment bispecifics',
  'A 5-residue linker is too short for VH to fold back onto its own VL, so two chains cross-pair.',
  {'chains': [['VH.a#c1vh','L#c1l[LENGTH:5]','VL.b#c1vl'], ['VH.b#c2vh','L#c2l[LENGTH:5]','VL.a#c2vl']],
   'pairs': [('c1vh','c2vl',0), ('c2vh','c1vl',0)]})

F('scDiabody', 'Fragment bispecifics',
  'The diabody folded onto a single chain by adding a third, longer middle linker.',
  {'chains': [['VH.a#vha','L#l1[LENGTH:5]','VL.b#vlb','L#l2[LENGTH:15]','VH.b#vhb','L#l3[LENGTH:5]','VL.a#vla']],
   'pairs': [('vha','vla',0), ('vhb','vlb',0)]})

F('DART', 'Fragment bispecifics',
  'A diabody locked by an added C-terminal interchain disulfide for stability.',
  {'chains': [['VH.a#c1vh','L#c1l[LENGTH:5]','VL.b#c1vl','H*#c1d[MOD:DISULFIDE]'],
              ['VH.b#c2vh','L#c2l[LENGTH:5]','VL.a#c2vl','H*#c2d[MOD:DISULFIDE]']],
   'pairs': [('c1vh','c2vl',0), ('c2vh','c1vl',0), ('c1d','c2d',1)]})

F('TandAb', 'Fragment bispecifics',
  'Two identical four-domain chains dimerise head-to-tail into a tetravalent bispecific.',
  {'chains': [['VH.a#1vha','L#1l1[LENGTH:5]','VL.b#1vlb','L#1l2[LENGTH:5]','VH.b#1vhb','L#1l3[LENGTH:5]','VL.a#1vla'],
              ['VH.a#2vha','L#2l1[LENGTH:5]','VL.b#2vlb','L#2l2[LENGTH:5]','VH.b#2vhb','L#2l3[LENGTH:5]','VL.a#2vla']],
   'pairs': [('1vha','2vla',0), ('1vlb','2vhb',0), ('2vha','1vla',0), ('2vlb','1vhb',0)]})

_a,_pa = scfv('x','a'); _b,_pb = scfv('y','b'); _c,_pc = scfv('z','c')
F('Triplebody', 'Fragment bispecifics',
  'Three scFvs in a row on one chain, giving three specificities without an Fc.',
  {'chains': [_a + ['L#m1[LENGTH:10]'] + _b + ['L#m2[LENGTH:10]'] + _c], 'pairs': _pa+_pb+_pc})

# ---- Fc fusions ----------------------------------------------------------
_a,_pa = scfv('x','a'); _b,_pb = scfv('y','a')
F('scFv-Fc', 'Fc fusions',
  'An scFv on each side of an Fc: bivalent, monospecific, roughly half the mass of an IgG.',
  {'chains': [_a+fc('p'), _b+fc('q')], 'pairs': _pa+_pb+fc_pairs('p','q')})

F('VHH-Fc (HCAb)', 'Fc fusions',
  'Camelid-style heavy-chain-only antibody: one VHH per chain, straight onto the hinge.',
  {'chains': [['VHH.a#pv']+fc('p'), ['VHH.a#qv']+fc('q')], 'pairs': fc_pairs('p','q')})

F('Bispecific VHH-Fc', 'Fc fusions',
  'Two different VHH domains on a knob-into-hole Fc — the compact asymmetric bispecific.',
  {'chains': [['VHH.a#pv']+fc('p', ch3mods='>'), ['VHH.b#qv']+fc('q', ch3mods='@')],
   'pairs': fc_pairs('p','q')})

_a,_pa = scfv('x','a'); _b,_pb = scfv('y','b'); _c,_pc = scfv('z','a'); _d,_pd = scfv('w','b')
F('Tandem scFv-Fc', 'Fc fusions',
  'Two tandem scFvs per chain on an Fc: tetravalent and bispecific, fully symmetric.',
  {'chains': [_a+['L#m1[LENGTH:10]']+_b+fc('p'), _c+['L#m2[LENGTH:10]']+_d+fc('q')],
   'pairs': _pa+_pb+_pc+_pd+fc_pairs('p','q')})

F('Diabody-Fc', 'Fc fusions',
  'A diabody grafted onto an Fc, which restores long serum half-life.',
  {'chains': [['VH.a#1vh','L#1l[LENGTH:5]','VL.b#1vl']+fc('p'), ['VH.b#2vh','L#2l[LENGTH:5]','VL.a#2vl']+fc('q')],
   'pairs': [('1vh','2vl',0), ('2vh','1vl',0)]+fc_pairs('p','q')})

F('Receptor-Fc trap', 'Fc fusions',
  'A soluble receptor ectodomain on an Fc, used to soak up a ligand.',
  {'chains': [['X#px[TYPE:FUSION,NOTE:receptor ectodomain]']+fc('p'),
              ['X#qx[TYPE:FUSION,NOTE:receptor ectodomain]']+fc('q')], 'pairs': fc_pairs('p','q')})

_H1,_L1,_P1 = arm('p','a'); _H2,_L2,_P2 = arm('q','b')
F('Zipper-assembled bispecific', 'Fc fusions',
  'A leucine zipper on each C-terminus forces the two different half-antibodies together.',
  {'chains': [_H1+fc('p')+['X#pz[TYPE:ZIPPER]'], _L1, _H2+fc('q')+['X#qz[TYPE:ZIPPER]'], _L2],
   'pairs': _P1+_P2+fc_pairs('p','q')+[('pz','qz',0)]})

# ---- Trispecific ---------------------------------------------------------
_H1,_L1,_P1 = arm('p','a'); _H2,_L2,_P2 = arm('q','b'); _s,_sp = scfv('r','c')
F('Trispecific IgG-scFv', 'Trispecific',
  'A knob-into-hole bispecific with a third specificity appended as an scFv on one chain.',
  {'chains': [_H1+fc('p', ch3mods='>')+['L#rlk[LENGTH:15]']+_s, _L1, _H2+fc('q', ch3mods='@'), _L2],
   'pairs': _P1+_P2+fc_pairs('p','q')+_sp})

F('Trispecific VHH-Fc', 'Trispecific',
  'Three VHH domains distributed across a knob-into-hole Fc.',
  {'chains': [['VHH.a#pv','L#pl[LENGTH:15]','VHH.b#pv2']+fc('p', ch3mods='>'),
              ['VHH.c#qv']+fc('q', ch3mods='@')], 'pairs': fc_pairs('p','q')})

# ---- Receptors -----------------------------------------------------------
F('TCR alpha-beta', 'Receptors', 'The alpha/beta T-cell receptor ectodomain pair.',
  {'chains': [['VA#va','CA#ca'], ['VB#vb','CB#cb']], 'pairs': [('va','vb',0), ('ca','cb',1)]})
F('TCR gamma-delta', 'Receptors', 'The gamma/delta T-cell receptor ectodomain pair.',
  {'chains': [['VG#vg','CG#cg'], ['VD#vd','CD#cd']], 'pairs': [('vg','vd',0), ('cg','cd',1)]})

if __name__ == '__main__':
    import sys
    json.dump(FORMATS, open(sys.argv[1] if len(sys.argv) > 1 else 'formats.json', 'w'), indent=1, ensure_ascii=False)
    print(f'{len(FORMATS)} formats')
    cats = {}
    for f in FORMATS: cats.setdefault(f['category'], []).append(f['name'])
    for c, n in cats.items(): print(f'  {c}: {len(n)}')
