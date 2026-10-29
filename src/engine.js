/* ============================================================
   Aureka AbDraw - drawing engine
   Parser, layout and SVG renderer for the AbML antibody notation.
   Pure: no DOM, no globals beyond its own. Runs in a browser as a plain
   script and in Node via require().

   AbML grammar: Sweet-Jones, Ahmad & Martin, mAbs 14:1 (2022).
   Independent implementation; see NOTICE.md.
   ============================================================ */
"use strict";

/* ============================================================
   Aureka AbDraw — AbML v1.06 parser + schematic renderer
   AbML grammar: Sweet-Jones, Ahmad & Martin, mAbs 2022 (abYdraw, GPL-3.0)
   ============================================================ */

/* ---------- grammar tables ---------- */
const VERSION = '1.2.1';
const DTYPES = ['VHH','CH1','CH2','CH3','CH4','CH5','VH','VL','CL','VA','VB','VG','VD','CA','CB','CG','CD','H','L','X','C'];
const MODCH  = '*>@+_!^';
const MODNAME = {'*':'general modification','>':'knob','@':'hole','+':'positive charge','_':'negative charge','!':'aglycosyl CH2','^':'ADC conjugation site'};
const CONNECTOR = new Set(['H','L']);
/* heavy-derived vs light-derived domain origin (drives the pale/dark tint) */
const HEAVYSIDE = new Set(['VH','VHH','CH1','CH2','CH3','CH4','CH5','H','VA','CA','VG','CG']);
const LIGHTSIDE = new Set(['VL','CL','VB','CB','VD','CD']);
const CMT_KEYS = ['ANTI','MOD','TYPE','LENGTH','CLASS','NOTE','ASEQ','DSEQ'];

/* ---------- palettes ---------- */
const PALETTES = {
  /* Aureka figure guide: own molecules on the Blues ramp off #0000FF,
     benchmarks on the Reds ramp off #FF0000, controls on Greys off #808080 */
  aureka: {a:['#0000FF','#00FFFF'], b:['#FF0000','#FFD700'], c:['#808080','#C0C0C0'],
           d:['#00008B','#87CEFA'], e:['#8B0000','#FA8072'], f:['#4682B4','#B0C4DE'],
           g:['#DC143C','#F08080'], h:['#191970','#AFEEEE']},
  figure: {a:['#FF0000','#FFD700'], b:['#0000FF','#00FFFF'], c:['#808080','#C0C0C0'],
           d:['#8B0000','#FA8072'], e:['#00008B','#87CEFA'], f:['#DC143C','#F08080'],
           g:['#4682B4','#B0C4DE'], h:['#191970','#AFEEEE']},
  strict: {a:['#0000FF','#87CEFA'], b:['#FF0000','#FFA07A'], c:['#808080','#D3D3D3'],
           d:['#00008B','#B0C4DE'], e:['#8B0000','#F08080'], f:['#4682B4','#ADD8E6'],
           g:['#B22222','#FA8072'], h:['#191970','#AFEEEE']}
};
/* non-Ig domains reuse the ChimeraX colours from the Aureka structure guide */
const COL_X = '#6C5ABA', COL_XL = '#CCC2FB', COL_C = '#F7DEB5';


/* ---------- small helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const f2 = n => (Math.round(n*100)/100);
function splitTop(str, sep){
  const out=[]; let d=0, cur='';
  for(const ch of str){
    if(ch==='('||ch==='['||ch==='{') d++;
    else if(ch===')'||ch===']'||ch==='}') d--;
    if(ch===sep && d<=0){ out.push(cur); cur=''; } else cur+=ch;
  }
  out.push(cur); return out;
}

/* ---------- parser ---------- */
function parseDomain(tok, errors){
  const s = tok.trim(); if(!s) return null;
  const U = s.toUpperCase();
  let type=null, i=0;
  for(const t of DTYPES){ if(U.startsWith(t)){ type=t; i=t.length; break; } }
  if(!type){ errors.push('Unrecognised domain "'+s+'"'); return null; }
  const d = {type, mods:[], spec:'', id:null, partners:[], ss:0, comments:[], raw:s};
  while(i < s.length){
    const ch = s[i];
    if(MODCH.includes(ch)){ if(!d.mods.includes(ch)) d.mods.push(ch); i++; }
    else if(ch === '.'){ i++; let sp=''; while(i<s.length && /[a-hA-H]/.test(s[i])){ sp+=s[i].toLowerCase(); i++; } 
      if(!sp) errors.push('Empty specificity on "'+s+'"'); d.spec = sp; }
    else break;
  }
  if(s[i] === '('){
    const e = s.indexOf(')', i);
    if(e < 0){ errors.push('Unclosed ( in "'+s+'"'); return d; }
    const parts = s.slice(i+1, e).split(':');
    const idn = parseInt(parts[0], 10);
    if(!isNaN(idn)) d.id = idn;
    if(parts[1]) d.partners = parts[1].split(',').map(x=>parseInt(x,10)).filter(n=>!isNaN(n));
    i = e + 1;
  }
  if(s[i] === '{'){
    const e = s.indexOf('}', i);
    if(e < 0){ errors.push('Unclosed { in "'+s+'"'); return d; }
    d.ss = parseInt(s.slice(i+1, e), 10) || 0;
    i = e + 1;
  }
  while(s[i] === '['){
    const e = s.indexOf(']', i);
    if(e < 0){ errors.push('Unclosed [ in "'+s+'"'); return d; }
    splitTop(s.slice(i+1, e), ',').forEach(c=>{
      const m = c.match(/^\s*([A-Za-z]+)\s*:\s*([\s\S]*)$/);
      if(m){
        const k = m[1].toUpperCase();
        if(!CMT_KEYS.includes(k)) errors.push('Unknown comment keyword "'+m[1]+'"');
        d.comments.push({key:k, val:m[2].trim()});
      } else if(c.trim()) d.comments.push({key:'NOTE', val:c.trim()});
    });
    i = e + 1;
  }
  if(i < s.length) errors.push('Trailing "'+s.slice(i)+'" in "'+s+'"');
  if(d.mods.includes('>') && d.mods.includes('@')) errors.push(type+' carries both a knob and a hole');
  if(d.mods.includes('+') && d.mods.includes('_')) errors.push(type+' carries both charges');
  if(d.mods.includes('!') && type !== 'CH2') errors.push('"!" marks an aglycosyl CH2; not valid on '+type);
  return d;
}

function parseAbML(src){
  const errors = [];
  const clean = (src||'').replace(/\s+/g,' ').trim();
  if(!clean) return {chains:[], errors, byId:new Map()};
  let adc = false;
  const raw = splitTop(clean,'|').filter(cs => {
    if(/^\s*\[\s*ADC\s*\]\s*$/i.test(cs)){ adc = true; return false; }   // nonspecific conjugation
    return true;
  });
  const chains = raw
    .map(cs => splitTop(cs,'-').map(t=>parseDomain(t, errors)).filter(Boolean))
    .filter(c => c.length);
  chains.forEach((c,ci)=>c.forEach((d,di)=>{ d.ci=ci; d.di=di; }));
  const byId = new Map();
  chains.flat().forEach(d=>{
    if(d.id!=null){ if(byId.has(d.id)) errors.push('Duplicate domain id '+d.id); byId.set(d.id,d); }
  });
  chains.flat().forEach(d=>{
    d.pd = d.partners.map(p=>{
      const t = byId.get(p);
      if(!t) errors.push('Domain '+(d.id??'?')+' points at missing id '+p);
      return t;
    }).filter(Boolean);
  });
  if(chains.length > 1) chains.forEach((c, ci) => {
    if(!c.some(d => d.pd.some(p => p.ci !== ci)))
      errors.push('Chain ' + (ci+1) + ' does not interact with any other chain');
  });
  return {chains, errors, byId, adc};
}

function writeAbML(chains){
  return chains.map(c => c.map(d=>{
    let s = d.type + d.mods.join('');
    if(d.spec) s += '.' + d.spec;
    if(d.id != null) s += '(' + d.id + (d.partners.length ? ':' + d.partners.join(',') : '') + ')';
    if(d.ss) s += '{' + d.ss + '}';
    if(d.comments.length) s += '[' + d.comments.map(c2=>c2.key+':'+c2.val).join(',') + ']';
    return s;
  }).join('-')).join(' | ');
}

/* ============================================================
   Layout — assign every non-connector domain an (x, y, rotation)
   ============================================================ */
const GEO = {rx:13, ry:18, step:32, slot:26, armStart:34, stemTop:34, linkGap:21};

function findCore(chains){
  const flat = chains.flat();
  const tail = d => chains[d.ci].slice(chains[d.ci].indexOf(d)+1).some(x => !CONNECTOR.has(x.type));
  const iglike = d => chains[d.ci].some(x => x.type==='CH1'||x.type==='CH2'||x.type==='CH3'||x.type==='CH4');
  for(const d of flat) if(d.type==='H')
    for(const p of d.pd) if(p.type==='H' && p.ci!==d.ci){
      /* an Fc stem below, or a Fab-like chain either side: otherwise it is just a
         C-terminal clasp (DART and friends) and the molecule is not Y-shaped */
      if(tail(d) || tail(p) || (iglike(d) && iglike(p))) return {kind:'hinge', a:d, b:p};
    }
  for(const T of ['CH2','CH3','CH4']) for(const d of flat) if(d.type===T)
    for(const p of d.pd) if(p.type===T && p.ci!==d.ci) return {kind:'fc', a:d, b:p};
  return null;
}

/* true when a linker separates two domains that end up adjacent in a column */
function linkedPair(chain, d1, d2){
  if(!d1 || !d2 || d1.ci !== d2.ci) return false;
  const i = chain.indexOf(d1), j = chain.indexOf(d2);
  if(i < 0 || j < 0) return false;
  return chain.slice(Math.min(i,j)+1, Math.max(i,j)).some(x => x.type === 'L');
}

function layout(parsed, opt){
  const chains = parsed.chains;
  const nodes = [], conns = [], bonds = [];
  if(!chains.length) return {nodes, conns, bonds, topo:'empty'};

  const A = (opt.armAngle||30) * Math.PI/180;
  const dir  = [{x:-Math.sin(A), y:-Math.cos(A)}, {x:Math.sin(A), y:-Math.cos(A)}];
  const perp = [{x:-Math.cos(A), y: Math.sin(A)}, {x:Math.cos(A), y: Math.sin(A)}]; // outward
  const rot  = [-(opt.armAngle||30), (opt.armAngle||30)];
  const placed = new Set();
  const put = (d, x, y, r, inX, side) => { d._x=x; d._y=y; d._r=r; d._inX=inX; d._slotSide=side||0; placed.add(d); nodes.push(d); };
  const units = c => c.filter(d => !CONNECTOR.has(d.type));

  const core = findCore(chains);
  let topo = 'linear', hingeCore = null, hingePair = null;

  if(core){
    topo = core.kind === 'hinge' ? 'Y (hinged)' : 'Y (Fc)';
    const hIdx = [core.a.ci, core.b.ci];
    const heavySet = new Set(hIdx);
    const arms = [], stems = [];
    hIdx.forEach((ci, side) => {
      const chain = chains[ci];
      const bi = chain.indexOf(side === 0 ? core.a : core.b);
      arms[side]  = units(chain.slice(0, bi));
      stems[side] = units(chain.slice(core.kind === 'hinge' ? bi+1 : bi));
    });

    /* --- Fc stem: paired columns for as long as the two chains really pair --- */
    const fcish = x => x.type==='CH2'||x.type==='CH3'||x.type==='CH4'||x.type==='CH5';
    let kB = 0;
    while(kB < Math.max(stems[0].length, stems[1].length)){
      const a = stems[0][kB], b = stems[1][kB];
      const together = a && b && (a.pd.includes(b) || b.pd.includes(a) || (fcish(a) && fcish(b) && a.type===b.type));
      if(together) kB++; else break;
    }
    for(let k=0; k<kB; k++){
      const y = GEO.stemTop + k*GEO.step;
      if(!placed.has(stems[0][k])) put(stems[0][k], -GEO.slot/2, y, 0, +GEO.rx, 0);
      if(!placed.has(stems[1][k])) put(stems[1][k], +GEO.slot/2, y, 0, -GEO.rx, 1);
    }
    /* --- C-terminal fusions below the Fc: each chain's own tail, pairing within itself --- */
    [0,1].forEach(side => {
      const tail = stems[side].slice(kB);
      if(!tail.length) return;
      const baseX = (side === 0 ? -1 : 1) * GEO.slot * 1.55;
      let y = GEO.stemTop + kB*GEO.step + (kB ? GEO.step*0.42 : 0);
      let prevT = null;
      tail.forEach(d => {
        if(placed.has(d)) return;
        if(prevT && linkedPair(chains[d.ci], prevT, d)) y += GEO.linkGap;
        const mate = d.pd.find(p => p !== d && !placed.has(p));
        if(mate){
          put(d,    baseX - GEO.slot/2, y, 0, +GEO.rx, 0);
          put(mate, baseX + GEO.slot/2, y, 0, -GEO.rx, 1);
        } else put(d, baseX, y, 0, +GEO.rx, 0);
        prevT = mate || d; y += GEO.step;
      });
    });

    /* --- hinge strands: anchored explicitly so F(ab')2 keeps its hinge with no Fc below --- */
    hingeCore = core.kind === 'hinge' ? [core.a, core.b] : null;

    /* --- arms: heavy chain on the limb axis, its partner one slot outboard --- */
    const armStart = Math.max(GEO.armStart, 15.5 / Math.max(0.17, Math.sin(A)));
    [0,1].forEach(side => {
      const seq = arms[side].slice().reverse();
      const sgn = side === 0 ? -1 : 1;                // local +x of the inboard face
      let rung = 0;
      seq.forEach(d => {
        if(placed.has(d)) return;                     // already drawn as someone's partner
        const t = armStart + rung*GEO.step;
        const cx = dir[side].x * t, cy = dir[side].y * t;
        put(d, cx, cy, rot[side], GEO.rx * sgn, 0);
        const mate = d.pd.find(p => p !== d && !placed.has(p) && !(p.ci !== d.ci && heavySet.has(p.ci)));
        if(mate) put(mate, cx + perp[side].x*GEO.slot, cy + perp[side].y*GEO.slot, rot[side], -GEO.rx * sgn, 1);
        rung++;
      });
    });
  }

  /* --- hinge strands and their disulfides --- */
  if(core && core.kind === 'hinge'){
    const ends = [0,1].map(side => {
      const chain = chains[side === 0 ? core.a.ci : core.b.ci];
      const bi = chain.indexOf(side === 0 ? core.a : core.b);
      const armSeq = chain.slice(0, bi).filter(d => !CONNECTOR.has(d.type) && placed.has(d));
      const prox = armSeq[armSeq.length - 1];
      const sx = (side === 0 ? -1 : 1) * GEO.slot/2;
      const stem0 = chain.slice(bi+1).find(d => !CONNECTOR.has(d.type) && placed.has(d));
      return {
        from: prox  ? {x: prox._x,  y: prox._y}  : {x: sx, y: -GEO.step},
        to:   stem0 ? {x: stem0._x, y: stem0._y} : {x: sx, y: GEO.stemTop * 0.78}
      };
    });
    conns.push({kind:'hinge', pts: ends[0]}, {kind:'hinge', pts: ends[1]});
    hingePair = {left: ends[0], right: ends[1], n: core.a.ss || 0};
  }

  /* --- everything still unplaced: stack remaining chains as columns --- */
  const leftovers = chains.map(c => units(c).filter(d => !placed.has(d))).filter(c => c.length);
  if(leftovers.length){
    if(!core) topo = leftovers.length > 1 ? 'paired chains' : 'single chain';
    /* group leftover chains that pair with each other */
    const used = new Set(); const groups = [];
    leftovers.forEach((c, i) => {
      if(used.has(i)) return;
      const g = [c]; used.add(i);
      leftovers.forEach((c2, j) => {
        if(used.has(j)) return;
        if(c.some(d => d.pd.some(p => c2.includes(p)))){ g.push(c2); used.add(j); }
      });
      groups.push(g);
    });
    /* place each group as its own column block, to the right of whatever exists */
    let originX = 0, originY = 0;
    if(nodes.length){
      const mx = Math.max(...nodes.map(n=>n._x));
      const my = Math.max(...nodes.map(n=>n._y));
      originX = mx + GEO.slot*2.2; originY = -GEO.ry;
    }
    groups.forEach(g => {
      const primary = g[0], second = g[1] || [];
      const seen = new Set();
      let y = originY, prev = null;
      primary.forEach(d => {
        if(placed.has(d)) return;
        if(prev && linkedPair(chains[d.ci], prev, d)) y += GEO.linkGap;
        const mate = d.pd.find(p => p !== d && !placed.has(p) && (second.includes(p) || p.ci === d.ci));
        if(mate){
          put(d,    originX - GEO.slot/2, y, 0, +GEO.rx, 0);
          put(mate, originX + GEO.slot/2, y, 0, -GEO.rx, 1);
        } else {
          put(d, originX, y, 0, +GEO.rx, 0);
        }
        seen.add(d); prev = mate || d; y += GEO.step;
      });
      /* any domain in this group still unplaced goes below, single file */
      g.flat().forEach(d => {
        if(placed.has(d)) return;
        if(prev && linkedPair(chains[d.ci], prev, d)) y += GEO.linkGap;
        put(d, originX, y, 0, +GEO.rx, 0); prev = d; y += GEO.step;
      });
      originX += GEO.slot*3.2;
    });
  }

  /* --- connectors: hinge, linkers, long peptide bonds --- */
  chains.forEach(chain => {
    for(let i=0;i<chain.length;i++){
      const d = chain[i];
      if(!CONNECTOR.has(d.type)) continue;
      if(hingeCore && hingeCore.includes(d)) continue;   // drawn from its own anchors
      let prev=null, next=null;
      for(let j=i-1;j>=0;j--) if(placed.has(chain[j])){ prev=chain[j]; break; }
      for(let j=i+1;j<chain.length;j++) if(placed.has(chain[j])){ next=chain[j]; break; }
      if(prev && next) conns.push({kind:d.type==='H'?'hinge':'linker', a:prev, b:next, d});
    }
    /* peptide bonds between placed neighbours that ended up far apart */
    const seq = chain.filter(d=>placed.has(d));
    for(let i=0;i+1<seq.length;i++){
      const a=seq[i], b=seq[i+1];
      const gap = Math.hypot(a._x-b._x, a._y-b._y);
      const between = chain.slice(chain.indexOf(a)+1, chain.indexOf(b)).some(d=>CONNECTOR.has(d.type));
      if(!between && gap > GEO.step*1.25) conns.push({kind:'pep', a, b});
    }
  });

  /* --- disulfides between side-by-side partners (opt-in: the CH1-CL one reads as a bond
         between the domains themselves, which is easy to misread, so it is off by default) --- */
  const done = new Set();
  nodes.forEach(d => {
    if(!d.ss) return;
    d.pd.forEach(p => {
      if(!placed.has(p)) return;
      if(Math.hypot(d._x-p._x, d._y-p._y) > GEO.slot*1.8) return;   // not actually side by side
      const key = [Math.min(d.id,p.id), Math.max(d.id,p.id)].join('-');
      if(done.has(key)) return; done.add(key);
      bonds.push({a:d, b:p, n:d.ss});
    });
  });
  if(hingePair && hingePair.n) bonds.push(Object.assign({hinge:true}, hingePair));
  return {nodes, conns, bonds, topo, core};
}

/* ============================================================
   Colour
   ============================================================ */
function chainSpec(chains, d){
  const c = chains[d.ci] || [];
  if(d.spec) return d.spec[0];
  for(let i=d.di-1;i>=0;i--) if(c[i].spec) return c[i].spec[0];
  for(let i=d.di+1;i<c.length;i++) if(c[i].spec) return c[i].spec[0];
  return 'a';
}
function colorFor(d, chains, opt){
  if(d.type==='X') return COL_X;
  if(d.type==='C') return COL_C;
  const pair = opt.pal[chainSpec(chains, d)] || opt.pal.a;
  if(opt.tint === 'flat') return pair[0];
  if(opt.tint === 'chain') return (d._slotSide === 1) ? pair[1] : pair[0];
  return LIGHTSIDE.has(d.type) ? pair[1] : pair[0];
}
function readable(hex){
  const h = hex.replace('#',''); 
  const r=parseInt(h.slice(0,2),16), g=parseInt(h.slice(2,4),16), b=parseInt(h.slice(4,6),16);
  const lin = v => { v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
  return (0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b)) > 0.42 ? '#000000' : '#FFFFFF';
}

/* ============================================================
   SVG renderer
   ============================================================ */
const FIGFONT = "'Times New Roman', Times, serif";
const VDOM = new Set(['VH','VL','VHH','VA','VB','VG','VD']);

/* Outline of one domain in its own local frame. Variable domains carry a notch at the
   antigen-binding end; VHH additionally sits on a flat base so it reads as unpaired. */
function domainOutline(d){
  const rx = GEO.rx, ry = GEO.ry;
  if(!VDOM.has(d.type)) return null;                       // constant domains stay plain ellipses
  const ang = (d._paratope == null ? -Math.PI/2 : d._paratope);
  const half = 0.21, depth = 0.70, steps = 56, flat = d.type === 'VHH' ? ry*0.62 : null;
  const pt = t => {
    let x = rx*Math.cos(t), y = ry*Math.sin(t);
    if(flat != null && y > flat) y = flat;
    return [x, y];
  };
  const span = 2*Math.PI - 2*half;
  let path = '';
  for(let i=0; i<=steps; i++){
    const [x,y] = pt(ang + half + span*(i/steps));
    path += (i ? ' L ' : 'M ') + f2(x) + ' ' + f2(y);
  }
  const [ax,ay] = [rx*Math.cos(ang)*depth, ry*Math.sin(ang)*depth];
  return path + ' L ' + f2(ax) + ' ' + f2(ay) + ' Z';
}

function nodeExtent(d, opt){
  const t = (d._r||0)*Math.PI/180, rx=GEO.rx, ry=GEO.ry;
  return {x: Math.hypot(rx*Math.cos(t), ry*Math.sin(t)), y: Math.hypot(rx*Math.sin(t), ry*Math.cos(t))};
}

function drawMods(d, opt, ink){
  let s = '';
  const inX = d._inX || GEO.rx, outX = -inX;
  if(d.mods.includes('>')) s += `<circle cx="${f2(inX*1.02)}" cy="0" r="4.8" fill="${d._fill}" stroke="${ink}" stroke-width="${opt.lw}"/>`;
  if(d.mods.includes('@')) s += `<circle cx="${f2(inX*0.56)}" cy="0" r="4.8" fill="${opt.bg||'#FFFFFF'}" stroke="${ink}" stroke-width="${opt.lw}"/>`;
  const charge = d.mods.includes('+') ? '+' : d.mods.includes('_') ? '−' : '';
  if(charge) s += `<text x="${f2(inX*0.66)}" y="0" font-size="11" font-family="${FIGFONT}" fill="${d._tx}" text-anchor="middle" dominant-baseline="central" transform="rotate(${f2(-(d._r||0))} ${f2(inX*0.66)} 0)">${charge}</text>`;
  const rim = [];
  if(d.mods.includes('*')) rim.push('∗');
  if(d.mods.includes('^')) rim.push('◆');
  if(d.mods.includes('!')) rim.push('✕');
  /* stack marks above and below the label rather than beside it, so they never sit on the text */
  const mslot = [{x: 0, y: -GEO.ry*0.60}, {x: 0, y: GEO.ry*0.60}, {x: outX*0.56, y: -GEO.ry*0.60}];
  rim.forEach((g, i) => {
    const q = mslot[i] || {x: outX*0.56, y: GEO.ry*0.60};
    s += `<text x="${f2(q.x)}" y="${f2(q.y)}" font-size="8.5" font-family="${FIGFONT}" fill="${d._tx}" text-anchor="middle" dominant-baseline="central" transform="rotate(${f2(-(d._r||0))} ${f2(q.x)} ${f2(q.y)})">${g}</text>`;
  });
  return s;
}

/* Builds one molecule as an SVG fragment plus its bounding box. */
function buildFigure(abml, opt){
  const parsed = parseAbML(abml);
  const L = layout(parsed, opt);
  const ink = opt.ink, lw = opt.lw;
  if(!L.nodes.length) return {body:'', box:{x0:0,y0:0,x1:1,y1:1}, parsed, L};

  const cx0 = L.nodes.reduce((a,n)=>a+n._x,0)/L.nodes.length;
  const cy0 = L.nodes.reduce((a,n)=>a+n._y,0)/L.nodes.length;
  L.nodes.forEach(d => {
    d._fill = colorFor(d, parsed.chains, opt);
    d._tx = readable(d._fill);
    if(VDOM.has(d.type)){
      let wx = d._x - cx0, wy = d._y - cy0;
      if(Math.hypot(wx, wy) < 1){ wx = 0; wy = -1; }                 // lone domain: point up
      const r = -(d._r || 0) * Math.PI/180;                          // into the domain's own frame
      d._paratope = Math.atan2(wx*Math.sin(r) + wy*Math.cos(r), wx*Math.cos(r) - wy*Math.sin(r));
    }
    d._outline = domainOutline(d);
    /* chain termini: the domain's long axis runs N (local -y) to C (local +y) */
    const th = (d._r || 0) * Math.PI/180, sn = Math.sin(th), cs = Math.cos(th);
    d._nEnd = {x: d._x + GEO.ry*sn,  y: d._y - GEO.ry*cs};
    d._cEnd = {x: d._x - GEO.ry*sn,  y: d._y + GEO.ry*cs};
  });

  let under = '', over = '', marks = '';

  /* connectors beneath the domains */
  L.conns.forEach(c => {
    if(c.pts){                                     // hinge strand, drawn between fixed anchors
      const {from, to} = c.pts;
      const col = opt.paperColours ? '#1B5E20' : ink;
      under += `<line x1="${f2(from.x)}" y1="${f2(from.y)}" x2="${f2(to.x)}" y2="${f2(to.y)}" stroke="${col}" stroke-width="${f2(lw*1.25)}" stroke-linecap="round"/>`;
      if(opt.hingeLabel)
        marks += `<text x="${f2((from.x+to.x)/2 - 12)}" y="${f2((from.y+to.y)/2)}" font-size="8.5" font-family="${FIGFONT}" fill="${ink}" text-anchor="middle">H</text>`;
      return;
    }
    const {a,b} = c;
    /* a polypeptide leaves one domain at its C-terminus and enters the next at its
       N-terminus, so both connector kinds are anchored there rather than centre to centre */
    const A = a._cEnd, B = b._nEnd;
    if(c.kind === 'linker'){
      /* leave along the C-terminal direction and arrive along the N-terminal one, so the
         path reads as backbone and never cuts across an antigen-binding end */
      const dist = Math.hypot(B.x-A.x, B.y-A.y) || 1;
      const outA = {x: (A.x-a._x)/GEO.ry, y: (A.y-a._y)/GEO.ry};
      const outB = {x: (B.x-b._x)/GEO.ry, y: (B.y-b._y)/GEO.ry};
      const lenC = c.d.comments.find(k2 => k2.key === 'LENGTH');
      const aa = lenC ? parseFloat(lenC.val) : NaN;
      const slack = isNaN(aa) ? 1 : Math.max(0.68, Math.min(1.45, 0.60 + aa/24));
      let h = Math.max(13, Math.min(27, dist*0.55)) * slack;
      /* when the C-terminus points away from the next domain the chain has to double back;
         route that around the outside instead of straight through the molecule */
      const toB = {x: (B.x-A.x)/dist, y: (B.y-A.y)/dist};
      const align = outA.x*toB.x + outA.y*toB.y;
      let sx = 0, sy = 0;
      if(align < 0.1){
        h *= 0.5;
        let px = -toB.y, py = toB.x;
        const ox = (A.x+B.x)/2 - cx0, oy = (A.y+B.y)/2 - cy0;
        if(px*ox + py*oy < 0){ px = -px; py = -py; }       // bow away from the core
        sx = px * h * 1.7; sy = py * h * 1.7;
      }
      const col = opt.paperColours ? '#6A1B9A' : ink;
      under += `<path d="M ${f2(A.x)} ${f2(A.y)} C ${f2(A.x+outA.x*h+sx)} ${f2(A.y+outA.y*h+sy)} ${f2(B.x+outB.x*h+sx)} ${f2(B.y+outB.y*h+sy)} ${f2(B.x)} ${f2(B.y)}" fill="none" stroke="${col}" stroke-width="${lw}" stroke-linecap="round"/>`;
      if(opt.linkLabel && lenC){
        const lx = (A.x+B.x)/2 + (outA.x+outB.x)*h*0.42 + sx*0.7, ly = (A.y+B.y)/2 + (outA.y+outB.y)*h*0.42 + sy*0.7;
        marks += `<text x="${f2(lx)}" y="${f2(ly+3)}" font-size="7.5" font-family="${FIGFONT}" fill="${ink}" text-anchor="middle">${esc(lenC.val)}</text>`;
      }
    } else {
      under += `<line x1="${f2(A.x)}" y1="${f2(A.y)}" x2="${f2(B.x)}" y2="${f2(B.y)}" stroke="${ink}" stroke-width="${lw}" stroke-linecap="round"${opt.arrows?' marker-end="url(#ncArrow)"':''}/>`;
    }
  });

  /* disulfides */
  L.bonds.forEach(bd => {
    if(bd.hinge){
      if(!opt.ss) return;
      /* one cysteine pairs with exactly one partner, so each bond is its own
         rung across the two strands - never a cross */
      const n = Math.min(bd.n, 4);
      const at = (e, t) => ({x: e.from.x + (e.to.x - e.from.x)*t, y: e.from.y + (e.to.y - e.from.y)*t});
      for(let i=0; i<n; i++){
        const t = 0.47 + i*(0.15/Math.max(1, n-1 || 1));
        const l = at(bd.left, t), r = at(bd.right, t);
        under += `<line x1="${f2(l.x)}" y1="${f2(l.y)}" x2="${f2(r.x)}" y2="${f2(r.y)}" stroke="#D11A1A" stroke-width="${f2(lw*1.05)}" stroke-linecap="round"/>`;
      }
      return;
    }
    if(!opt.ssDomain) return;
    const {a,b,n} = bd;
    const dx=b._x-a._x, dy=b._y-a._y, len=Math.hypot(dx,dy)||1;
    const mx=(a._x+b._x)/2, my=(a._y+b._y)/2;
    const px=-dy/len, py=dx/len;
    for(let i=0;i<Math.min(n,3);i++){
      const o=(i-(Math.min(n,3)-1)/2)*7;
      over += `<line x1="${f2(mx+px*o-dx/len*5)}" y1="${f2(my+py*o-dy/len*5)}" x2="${f2(mx+px*o+dx/len*5)}" y2="${f2(my+py*o+dy/len*5)}" stroke="#D11A1A" stroke-width="${f2(lw*1.1)}" stroke-linecap="round"/>`;
    }
  });

  /* domains */
  let doms = '';
  L.nodes.forEach(d => {
    const lbl = opt.labels ? (d.type + (opt.showSpec && d.spec ? d.spec : '')) : '';
    const size = lbl.length >= 4 ? 8 : lbl.length === 3 ? 9 : 10;
    doms += `<g transform="translate(${f2(d._x)},${f2(d._y)}) rotate(${f2(d._r||0)})">`
      + (d._outline
          ? `<path d="${d._outline}" fill="${d._fill}" stroke="${ink}" stroke-width="${lw}" stroke-linejoin="round"/>`
          : `<ellipse rx="${GEO.rx}" ry="${GEO.ry}" fill="${d._fill}" stroke="${ink}" stroke-width="${lw}"/>`)
      + drawMods(d, opt, ink)
      + (lbl ? (() => { const sh = (d.mods.includes('>')||d.mods.includes('@')) ? -(d._inX||GEO.rx)*0.46 : 0;
          return `<text x="${f2(sh)}" y="0" font-size="${size}" font-family="${FIGFONT}" fill="${d._tx}" text-anchor="middle" dominant-baseline="central" transform="rotate(${f2(-(d._r||0))} ${f2(sh)} 0)">${esc(lbl)}</text>`; })() : '')
      + `</g>`;
    if(opt.ids && d.id != null){
      const ex = nodeExtent(d, opt);
      marks += `<text x="${f2(d._x + (d._inX>0 ? -ex.x-4 : ex.x+4))}" y="${f2(d._y)}" font-size="7.5" font-family="${FIGFONT}" fill="${ink}" text-anchor="${d._inX>0?'end':'start'}" dominant-baseline="central">${d.id}</text>`;
    }
  });

  /* bounding box */
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  L.nodes.forEach(d => {
    const e = nodeExtent(d, opt);
    x0=Math.min(x0,d._x-e.x-8); x1=Math.max(x1,d._x+e.x+8);
    y0=Math.min(y0,d._y-e.y-8); y1=Math.max(y1,d._y+e.y+8);
  });
  return {body: under + doms + over + marks, box:{x0,y0,x1,y1}, parsed, L};
}

function commentLines(parsed){
  const out = [];
  if(parsed.adc) out.push('[ADC]  nonspecific conjugation');
  parsed.chains.flat().forEach(d => d.comments.forEach(c => {
    out.push((d.type + (d.spec?'.'+d.spec:'') + (d.id!=null?' '+d.id:'')) + '  ' + c.key + ': ' + c.val);
  }));
  return out;
}

function svgDocument(inner, w, h, opt, meta){
  const prov = meta ? `<!-- Generated by Aureka AbDraw v${VERSION} - https://github.com/Drjackxiaoyuchen/aureka-abdraw -->`
    + `<title>${esc(meta.title || 'Antibody format schematic')}</title>`
    + `<desc>AbML: ${esc(meta.abml || '')}</desc>` : '';
  const defs = opt.arrows ? `<defs><marker id="ncArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${opt.ink}"/></marker></defs>` : '';
  const bg = opt.bg ? `<rect x="0" y="0" width="${f2(w)}" height="${f2(h)}" fill="${opt.bg}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${f2(w)}" height="${f2(h)}" viewBox="0 0 ${f2(w)} ${f2(h)}">${prov}${defs}${bg}${inner}</svg>`;
}

/* single molecule, optionally with its comment column */
function renderOne(abml, opt){
  const fig = buildFigure(abml, opt);
  if(!fig.body) return {svg: svgDocument('', 10, 10, opt, null), parsed: fig.parsed, L: fig.L};
  const b = fig.box, k = opt.scale;
  const lines = opt.notes ? commentLines(fig.parsed) : [];
  const noteW = lines.length ? 190 : 0;
  const w = (b.x1-b.x0)*k + noteW, h = Math.max((b.y1-b.y0)*k, lines.length*15+12);
  let inner = `<g transform="translate(${f2(-b.x0*k)},${f2(-b.y0*k)}) scale(${f2(k)})">${fig.body}</g>`;
  if(lines.length){
    const x = (b.x1-b.x0)*k + 14;
    inner += lines.map((t,i)=>`<text x="${f2(x)}" y="${f2(16+i*15)}" font-size="11" font-family="${FIGFONT}" fill="${opt.ink}">${esc(t)}</text>`).join('');
  }
  return {svg: svgDocument(inner, w, h, opt, {title: opt.figTitle, abml}), parsed: fig.parsed, L: fig.L};
}

/* lettered multi-panel grid */
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function renderPanels(panels, opt, cols){
  const o = Object.assign({}, opt, {notes:false});
  const figs = panels.map(p => buildFigure(p.abml, o)).filter(f => f.body);
  if(!figs.length) return svgDocument('', 10, 10, opt, null);
  const k = opt.scale;
  const cw = Math.max(...figs.map(f => (f.box.x1-f.box.x0)*k)) + 26;
  const ch = Math.max(...figs.map(f => (f.box.y1-f.box.y0)*k)) + 34;
  const n = figs.length, C = Math.max(1, Math.min(cols, n)), R = Math.ceil(n/C);
  let inner = '';
  figs.forEach((fg, i) => {
    const r = Math.floor(i/C), c = i%C;
    const ox = c*cw, oy = r*ch;
    const fw = (fg.box.x1-fg.box.x0)*k;
    const padX = ox + (cw - fw)/2;
    inner += `<text x="${f2(ox+8)}" y="${f2(oy+17)}" font-size="15" font-weight="bold" font-family="${FIGFONT}" fill="${opt.ink}">${LETTERS[i]||'?'}</text>`;
    inner += `<g transform="translate(${f2(padX - fg.box.x0*k)},${f2(oy+24 - fg.box.y0*k)}) scale(${f2(k)})">${fg.body}</g>`;
  });
  return svgDocument(inner, C*cw, R*ch, opt, {title: 'Antibody format panels', abml: panels.map(p=>p.abml).join('  ||  ')});
}


/* ---------- a complete option set, so callers need not assemble one ---------- */
function defaultOptions(over){
  return Object.assign({
    pal: PALETTES.aureka,
    tint: 'type',          // 'type' | 'chain' | 'flat'
    labels: true,
    showSpec: false,
    hingeLabel: false,
    linkLabel: true,
    ids: false,
    notes: false,
    ss: true,              // interchain (hinge) disulfides
    ssDomain: false,       // CH1-CL style domain-pair disulfides
    arrows: false,
    paperColours: false,
    lw: 1.6,
    armAngle: 30,
    scale: 1.6,
    bg: null,              // null = transparent
    ink: '#000000',
    figTitle: 'Antibody format schematic'
  }, over || {});
}

/* ---------- Node ---------- */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    VERSION, DTYPES, MODCH, MODNAME, CONNECTOR, HEAVYSIDE, LIGHTSIDE, CMT_KEYS,
    PALETTES, COL_X, COL_XL, COL_C, GEO, VDOM,
    parseAbML, writeAbML, findCore, layout,
    chainSpec, colorFor, readable,
    buildFigure, commentLines, svgDocument, renderOne, renderPanels,
    defaultOptions, esc, splitTop
  };
}
