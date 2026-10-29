"use strict";
/* ============================================================
   App state + UI
   ============================================================ */
const S = {
  abml: byName('Knob-into-hole').abml,
  pal: Object.assign({}, PALETTES.aureka),
  panels: [],
  current: 'Knob-into-hole',
  lastSVG: ''
};

function opts(){
  return {
    pal: S.pal,
    tint: $('#oTint').value,
    labels: $('#oLabels').checked,
    showSpec: $('#oSpec').checked,
    hingeLabel: $('#oHinge').checked,
    linkLabel: $('#oLink').checked,
    ids: $('#oIds').checked,
    notes: $('#oNotes').checked,
    ss: $('#oSS').checked,
    ssDomain: $('#oSSdom').checked,
    arrows: $('#oArrow').checked,
    paperColours: $('#oPaper').checked,
    lw: parseFloat($('#oLw').value),
    armAngle: parseFloat($('#oAngle').value),
    scale: parseFloat($('#oScale').value),
    bg: $('#oBg').checked ? '#FFFFFF' : null,
    figTitle: S.current || 'Antibody format schematic',
    ink: '#000000'
  };
}

let toastT = null;
function toast(msg){
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(()=>{ t.hidden = true; }, 2300);
}

function draw(){
  const o = opts();
  const usePanels = $('#oPanOn').checked && S.panels.length;
  let svg, parsed, L;
  if(usePanels){
    svg = renderPanels(S.panels, o, parseInt($('#oCols').value,10)||4);
    parsed = parseAbML(S.abml); L = layout(parsed, o);
  } else {
    const r = renderOne(S.abml, o); svg = r.svg; parsed = r.parsed; L = r.L;
  }
  S.lastSVG = svg;
  $('#paper').innerHTML = svg;
  $('#paper').classList.toggle('solid', !!o.bg);

  const st = $('#sStatus');
  if(!S.abml.trim()){ st.textContent=''; st.className='status'; }
  else if(parsed.errors.length){ st.textContent = parsed.errors.length + ' issue' + (parsed.errors.length>1?'s':''); st.className='status bad'; }
  else { st.textContent = 'valid'; st.className='status ok'; }
  $('#sNotes').textContent = parsed.errors.slice(0,6).join('\n');

  const cur = S.current ? byName(S.current) : null;
  $('#sName').textContent = cur ? cur.name : 'Custom';
  $('#sDesc').textContent = cur ? cur.description : 'edited by hand';
  const nD = parsed.chains.flat().length;
  $('#sTopo').textContent = usePanels
    ? S.panels.length + ' panel' + (S.panels.length>1?'s':'')
    : (L.topo === 'empty' ? 'nothing to draw' : L.topo);
  $('#sTopo').textContent += (!usePanels && parsed.adc) ? ' \u00b7 ADC' : '';
  $('#sCount').textContent = usePanels ? '' :
    parsed.chains.length + ' chain' + (parsed.chains.length===1?'':'s') + ' · ' + nD + ' domain' + (nD===1?'':'s');

  buildChainUI(parsed);
}

/* ---------- format library ---------- */
function loadFormat(name, setHash){
  const f = byName(name); if(!f) return false;
  S.current = name; S.abml = f.abml; $('#abml').value = f.abml;
  if(setHash !== false){ try { location.hash = slug(name); } catch(e){} }
  buildLibrary($('#libSearch').value); draw(); return true;
}

function buildLibrary(filter){
  const q = (filter||'').toLowerCase().trim();
  const host = $('#libList'); host.innerHTML = '';
  const hits = LIBRARY.filter(f => !q || f.name.toLowerCase().includes(q)
    || f.category.toLowerCase().includes(q) || f.description.toLowerCase().includes(q));
  let cat = null;
  hits.forEach(f => {
    if(f.category !== cat){
      cat = f.category;
      const h = document.createElement('h4'); h.className = 'libcat'; h.textContent = cat;
      host.appendChild(h);
    }
    const b = document.createElement('button');
    b.textContent = f.name; b.title = f.description;
    b.setAttribute('aria-current', String(f.name === S.current));
    b.onclick = () => loadFormat(f.name);
    host.appendChild(b);
  });
  if(!hits.length) host.innerHTML = '<p class="hint">No format matches that.</p>';
}

/* ---------- chain builder ---------- */
function buildChainUI(parsed){
  const host = $('#chainList'); host.innerHTML = '';
  const sel = $('#addChain'); const keep = sel.value;
  sel.innerHTML = parsed.chains.map((c,i)=>`<option value="${i}">End of chain ${i+1}</option>`).join('')
    || '<option value="0">Chain 1</option>';
  if(keep && keep < parsed.chains.length) sel.value = keep;

  parsed.chains.forEach((c, ci) => {
    const box = document.createElement('div'); box.className = 'chain';
    const hd = document.createElement('header');
    hd.innerHTML = `<span>Chain ${ci+1}</span><span class="sp"></span>`;
    const del = document.createElement('button'); del.textContent = '×'; del.title = 'Delete chain';
    del.onclick = () => { const p = parseAbML(S.abml); p.chains.splice(ci,1); commit(p.chains); };
    hd.appendChild(del); box.appendChild(hd);
    const doms = document.createElement('div'); doms.className = 'doms';
    c.forEach((d, di) => {
      const chip = document.createElement('span'); chip.className = 'dchip';
      const sw = document.createElement('span'); sw.className = 'swatch';
      sw.style.background = CONNECTOR.has(d.type) ? 'transparent' : colorFor(d, parsed.chains, opts());
      if(CONNECTOR.has(d.type)) sw.style.borderStyle = 'dashed';
      chip.appendChild(sw);
      chip.appendChild(document.createTextNode(d.type + d.mods.join('') + (d.spec ? '.'+d.spec : '')));
      const x = document.createElement('button'); x.textContent = '×'; x.title = 'Remove domain';
      x.onclick = () => { const p = parseAbML(S.abml); p.chains[ci].splice(di,1); if(!p.chains[ci].length) p.chains.splice(ci,1); commit(p.chains); };
      chip.appendChild(x); doms.appendChild(chip);
    });
    if(!c.length) doms.innerHTML = '<span class="hint">empty</span>';
    box.appendChild(doms); host.appendChild(box);
  });
  if(!parsed.chains.length) host.innerHTML = '<p class="hint">No chains yet — add a domain to start one.</p>';
}

function commit(chains){
  S.abml = writeAbML(chains);
  $('#abml').value = S.abml;
  S.current = null; buildLibrary($('#libSearch').value);
  draw();
}

/* renumber every domain left to right, then pair by architecture */
function renumberAndPair(){
  const p = parseAbML(S.abml);
  if(!p.chains.length) return;
  let n = 1;
  p.chains.forEach(c => c.forEach(d => { d.id = n++; d.partners = []; }));
  const isHeavy = c => c.some(d => d.type==='H' || d.type==='CH2' || d.type==='CH3');
  const heavies = [], lights = [];
  p.chains.forEach(c => (isHeavy(c) ? heavies : lights).push(c));
  const link = (a,b) => { if(!a||!b) return; if(!a.partners.includes(b.id)) a.partners.push(b.id); if(!b.partners.includes(a.id)) b.partners.push(a.id); };

  if(heavies.length === 2){
    const br = heavies.map(c => { const i = c.findIndex(d => d.type==='H'); return i >= 0 ? i : c.findIndex(d => d.type==='CH2'); });
    if(br[0] >= 0 && br[1] >= 0){
      /* hinge / Fc: pair positionally outward from the branch point */
      for(let k=0; br[0]+k < heavies[0].length && br[1]+k < heavies[1].length; k++)
        link(heavies[0][br[0]+k], heavies[1][br[1]+k]);
      /* arms pair with their light chain, N-terminal index first */
      heavies.forEach((h, hi) => {
        const arm = h.slice(0, br[hi]);
        const lc = lights[hi];
        if(lc) arm.forEach((d, j) => link(d, lc[j]));
      });
    }
  } else {
    /* no Fc: pair chains two at a time, index for index */
    for(let i=0; i+1 < p.chains.length; i += 2)
      p.chains[i].forEach((d, j) => link(d, p.chains[i+1][j]));
    if(p.chains.length === 1){
      /* single chain: pair the first V with the last V (scFv-style) */
      const vs = p.chains[0].filter(d => d.type[0]==='V');
      for(let i=0, j=vs.length-1; i<j; i++, j--) link(vs[i], vs[j]);
    }
  }
  commit(p.chains);
  toast('Renumbered and re-paired');
}

/* ---------- palette editor ---------- */
function buildPalette(){
  const host = $('#palList'); host.innerHTML = '';
  'abcdefgh'.split('').forEach(k => {
    const row = document.createElement('div'); row.className = 'row';
    const lab = document.createElement('label'); lab.textContent = '.' + k;
    lab.style.flex = '0 0 22px'; lab.style.fontFamily = 'var(--f-mono)';
    row.appendChild(lab);
    [0,1].forEach(slot => {
      const inp = document.createElement('input'); inp.type = 'color'; inp.value = S.pal[k][slot];
      inp.title = slot ? 'light-chain domains' : 'heavy-chain domains';
      inp.oninput = () => { S.pal[k][slot] = inp.value; draw(); };
      row.appendChild(inp);
    });
    const tag = document.createElement('span'); tag.className = 'hint';
    tag.textContent = k==='a' ? 'lead' : k==='b' ? 'benchmark' : k==='c' ? 'control' : '';
    row.appendChild(tag);
    host.appendChild(row);
  });
}

/* ---------- panels ---------- */
function buildPanels(){
  const host = $('#panList'); host.innerHTML = '';
  S.panels.forEach((p, i) => {
    const row = document.createElement('div'); row.className = 'panelrow';
    const tag = document.createElement('strong'); tag.textContent = LETTERS[i] || '?';
    tag.style.flex = '0 0 14px';
    const inp = document.createElement('input'); inp.type = 'text'; inp.value = p.abml;
    inp.oninput = () => { p.abml = inp.value; draw(); };
    const use = document.createElement('button'); use.className='btn'; use.textContent='↑';
    use.title = 'Load into editor'; use.style.padding='3px 7px';
    use.onclick = () => { S.abml = p.abml; $('#abml').value = p.abml; draw(); };
    const x = document.createElement('button'); x.className='btn'; x.textContent='×';
    x.style.padding='3px 7px';
    x.onclick = () => { S.panels.splice(i,1); buildPanels(); draw(); };
    row.append(tag, inp, use, x); host.appendChild(row);
  });
  if(!S.panels.length) host.innerHTML = '<p class="hint">Empty. Load a format, then “Add current”.</p>';
}

/* ---------- export ---------- */
async function saveFile(filename, data){
  let dl = null;
  try { dl = await window.claude?.use?.('downloads'); } catch(e){}
  if(dl){
    try { await dl.save({filename, data}); toast('Saved ' + filename); return; }
    catch(err){
      if(err && err.code === 'declined') return;
      /* fall through to clipboard */
    }
  }
  if(!window.claude){                      // standalone copy: ordinary browser download
    try {
      const blob = data instanceof Blob ? data : new Blob([data], {type:'image/svg+xml;charset=utf-8'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast('Saved ' + filename); return;
    } catch(e){}
  }
  if(typeof data === 'string'){
    try { await navigator.clipboard.writeText(data); toast('Download unavailable here — SVG copied to clipboard'); return; } catch(e){}
  }
  toast('Could not save in this view');
}

function pngFromSVG(svgText, scale){
  return new Promise((res, rej) => {
    const m = svgText.match(/width="([\d.]+)" height="([\d.]+)"/);
    const w = Math.max(1, Math.round(parseFloat(m?m[1]:400) * scale));
    const h = Math.max(1, Math.round(parseFloat(m?m[2]:400) * scale));
    const blob = new Blob([svgText], {type:'image/svg+xml;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const cx = cv.getContext('2d');
      cx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      cv.toBlob(b => b ? res(b) : rej(new Error('encode failed')), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('render failed')); };
    img.src = url;
  });
}

function fileStem(){
  const base = ($('#oPanOn').checked && S.panels.length) ? 'antibody-panels' : (S.current || 'antibody-format');
  return base.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'antibody-format';
}

/* ============================================================
   Wiring
   ============================================================ */
(function init(){
  /* tabs */
  const tabs = [...document.querySelectorAll('.tab')];
  tabs.forEach(t => t.onclick = () => {
    tabs.forEach(o => {
      const on = o === t;
      o.setAttribute('aria-selected', String(on));
      document.getElementById(o.getAttribute('aria-controls')).hidden = !on;
    });
  });

  /* add-domain controls */
  const groups = [
    ['Immunoglobulin', ['VH','VL','CH1','CL','CH2','CH3','CH4','CH5','VHH']],
    ['T-cell receptor', ['VA','CA','VB','CB','VG','CG','VD','CD']],
    ['Other',           ['X','C']],
    ['Connectors',      ['H','L']]
  ];
  $('#addType').innerHTML = groups.map(([g, list]) =>
    `<optgroup label="${g}">` + list.map(t=>`<option value="${t}">${t}</option>`).join('') + `</optgroup>`).join('');
  $('#addSpec').innerHTML = '<option value="">—</option>' + 'abcdefgh'.split('').map(c=>`<option value="${c}">.${c}</option>`).join('');
  $('#addMods').innerHTML = MODCH.split('').map(m =>
    `<label class="ck" title="${MODNAME[m]}" style="flex:0 0 auto"><input type="checkbox" data-mod="${m}"><span style="font-family:var(--f-mono)">${m==='_'?'_':m}</span></label>`).join('');

  $('#bAddDom').onclick = () => {
    const p = parseAbML(S.abml);
    const ci = Math.min(parseInt($('#addChain').value,10)||0, Math.max(0, p.chains.length-1));
    const mods = [...document.querySelectorAll('#addMods input:checked')].map(i=>i.dataset.mod);
    const d = {type:$('#addType').value, mods, spec:$('#addSpec').value, id:null, partners:[], ss:0, comments:[]};
    if(!p.chains.length) p.chains.push([]);
    p.chains[ci].push(d);
    commit(p.chains);
  };
  $('#bAddChain').onclick = () => {
    const p = parseAbML(S.abml);
    p.chains.push([{type:'VH', mods:[], spec:'a', id:null, partners:[], ss:0, comments:[]}]);
    commit(p.chains);
  };
  $('#bRenumber').onclick = renumberAndPair;

  /* library */
  $('#libSearch').oninput = e => buildLibrary(e.target.value);

  /* abml editor */
  let t = null;
  $('#abml').addEventListener('input', e => {
    S.abml = e.target.value; S.current = null;
    clearTimeout(t); t = setTimeout(() => { buildLibrary($('#libSearch').value); draw(); }, 160);
  });
  $('#bClear').onclick = () => { S.abml=''; $('#abml').value=''; S.current=null; buildLibrary($('#libSearch').value); draw(); };

  /* style controls */
  ['oLabels','oSpec','oHinge','oLink','oIds','oNotes','oSS','oSSdom','oArrow','oPaper','oBg','oTint','oPanOn','oCols']
    .forEach(id => $('#'+id).addEventListener('change', draw));
  const ranges = {oLw:['#oLwV', v=>v], oAngle:['#oAngleV', v=>v+'°'], oScale:['#oScaleV', v=>v+'×']};
  Object.entries(ranges).forEach(([id,[out,fmt]]) => {
    $('#'+id).addEventListener('input', e => { $(out).textContent = fmt(e.target.value); draw(); });
  });
  $('#bPal').onclick = () => {
    const p = PALETTES[$('#palPreset').value];
    S.pal = JSON.parse(JSON.stringify(p));
    buildPalette(); draw(); toast('Palette applied');
  };

  /* panels */
  $('#bPanAdd').onclick = () => {
    if(!S.abml.trim()) return toast('Nothing in the editor');
    if(S.panels.length >= 26) return toast('26 panels is the limit');
    S.panels.push({abml:S.abml}); buildPanels();
    if(!$('#oPanOn').checked) $('#oPanOn').checked = true;
    draw();
  };
  $('#bPanClear').onclick = () => { S.panels = []; $('#oPanOn').checked = false; buildPanels(); draw(); };

  /* export */
  $('#bSvg').onclick = () => saveFile(fileStem() + '.svg', S.lastSVG);
  $('#bPng').onclick = async () => {
    try { const b = await pngFromSVG(S.lastSVG, 3); await saveFile(fileStem() + '.png', b); }
    catch(e){ toast('Could not render PNG'); }
  };
  $('#bCopySvg').onclick = async () => {
    try { await navigator.clipboard.writeText(S.lastSVG); toast('SVG markup copied'); }
    catch(e){ toast('Clipboard unavailable here'); }
  };
  $('#bCopy').onclick = async () => {
    try { await navigator.clipboard.writeText(S.abml); toast('AbML copied'); }
    catch(e){ $('#abml').select(); toast('Press ⌘C / Ctrl-C to copy'); }
  };

  /* deep link: #crossmab-ch1-cl opens that format */
  const fromHash = () => {
    const k = (location.hash || '').replace(/^#/, '');
    return k ? LIBRARY.find(f => slug(f.name) === k) : null;
  };
  const hit = fromHash();
  if(hit){ S.current = hit.name; S.abml = hit.abml; }
  window.addEventListener('hashchange', () => {
    const f = fromHash();
    if(f && f.name !== S.current) loadFormat(f.name, false);
  });

  /* go */
  $('#ver').textContent = 'v' + VERSION;
  $('#abml').value = S.abml;
  buildLibrary(''); buildPalette(); buildPanels(); draw();
})();
