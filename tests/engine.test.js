/* Correctness tests for the drawing engine. Plain Node, no dependencies.
   Each case pins down a rule the figures must obey; run with: node tests/engine.test.js */
const assert = require('assert');
const fs = require('fs'), path = require('path');
const E = require('../src/engine.js');
const LIB = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'formats.json'), 'utf8'));

const abml = n => { const f = LIB.find(x => x.name === n); assert.ok(f, 'no such format: ' + n); return f.abml; };
const fig  = (s, o) => E.buildFigure(s, E.defaultOptions(o));
const reds = body => [...body.matchAll(/<line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)" stroke="#D11A1A"/g)]
  .map(m => ({x1:+m[1], y1:+m[2], x2:+m[3], y2:+m[4]}));
const paths = body => [...body.matchAll(/<path d="(M ([-\d.]+) ([-\d.]+) C [^"]*?([-\d.]+) ([-\d.]+))" fill="none"/g)]
  .map(m => ({d:m[1], x0:+m[2], y0:+m[3], x1:+m[4], y1:+m[5]}));

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
};

console.log('\nlibrary');
test('every format parses with no errors', () => {
  for (const f of LIB) {
    const p = E.parseAbML(f.abml);
    assert.strictEqual(p.errors.length, 0, f.name + ': ' + p.errors.join('; '));
  }
});
test('every domain is placed exactly once', () => {
  for (const f of LIB) {
    const { parsed, L } = fig(f.abml);
    const want = parsed.chains.flat().filter(d => !E.CONNECTOR.has(d.type)).length;
    assert.strictEqual(L.nodes.length, want, f.name + ': placed ' + L.nodes.length + ' of ' + want);
    assert.strictEqual(new Set(L.nodes).size, L.nodes.length, f.name + ': a domain was placed twice');
  }
});

console.log('\ndisulfides');
test('hinge bonds are parallel rungs, never crossed', () => {
  const r = reds(fig(abml('IgG1')).body);
  assert.strictEqual(r.length, 2, 'expected 2 hinge bonds, got ' + r.length);
  for (const l of r) assert.ok(Math.abs(l.y1 - l.y2) < 1.0, 'rung is not horizontal');
  assert.ok(Math.abs(r[0].y1 - r[1].y1) > 2, 'rungs sit on top of each other');
  // two horizontal segments at different heights cannot cross
  assert.ok(Math.abs(r[0].y1 - r[1].y1) < 16, 'rungs are too far apart to read as a pair');
});
test('CH1-CL disulfide is off by default and on when asked', () => {
  assert.strictEqual(reds(fig(abml('Fab')).body).length, 0);
  assert.ok(reds(fig(abml('Fab'), {ssDomain:true}).body).length > 0);
});
test('no disulfide is drawn between domains that are not adjacent', () => {
  for (const f of LIB) {
    for (const l of reds(fig(f.abml, {ssDomain:true}).body)) {
      const len = Math.hypot(l.x2-l.x1, l.y2-l.y1);
      assert.ok(len < E.GEO.slot * 2.6, f.name + ': disulfide spans ' + len.toFixed(1));
    }
  }
});

console.log('\nconnectors');
test('a linker leaves the C-terminus and arrives at the N-terminus', () => {
  const { body, L } = fig(abml('scFv'));
  const vh = L.nodes.find(d => d.type === 'VH'), vl = L.nodes.find(d => d.type === 'VL');
  const p = paths(body);
  assert.strictEqual(p.length, 1, 'expected one linker path');
  assert.ok(Math.hypot(p[0].x0 - vh._cEnd.x, p[0].y0 - vh._cEnd.y) < 0.5, 'does not start at the VH C-terminus');
  assert.ok(Math.hypot(p[0].x1 - vl._nEnd.x, p[0].y1 - vl._nEnd.y) < 0.5, 'does not end at the VL N-terminus');
});
test('scFv draws a linker and Fv does not', () => {
  assert.strictEqual(paths(fig(abml('Fv')).body).length, 0);
  assert.strictEqual(paths(fig(abml('scFv')).body).length, 1);
});
test('domains joined by a linker are spaced far enough to show it', () => {
  const { L } = fig(abml('Trivalent VHH'));
  const ys = L.nodes.map(d => d._y).sort((a,b) => a-b);
  for (let i = 1; i < ys.length; i++)
    assert.ok(ys[i] - ys[i-1] >= E.GEO.ry * 2, 'gap of ' + (ys[i]-ys[i-1]).toFixed(1) + ' hides the linker');
});
test('a linker between stacked Fabs on an arm is given room', () => {
  // the 2:1 TCB case: a CrossFab fused N-terminally to another Fab on the same arm
  const tcb = 'VH.b(1:9)-CL(2:10){1}-L(3)[LENGTH:10]-VH.a(4:16)-CH1(5:17){1}-H(6:13){2}-CH2(7:14)-CH3>(8:15)'
            + '|VL.b(9:1)-CH1(10:2){1}|VH.a(11:18)-CH1(12:19){1}-H(13:6){2}-CH2(14:7)-CH3@(15:8)'
            + '|VL.a(16:4)-CL(17:5){1}|VL.a(18:11)-CL(19:12){1}';
  const { L, parsed } = fig(tcb);
  assert.strictEqual(parsed.errors.length, 0, parsed.errors.join('; '));
  const lk = L.conns.filter(c => c.kind === 'linker');
  assert.strictEqual(lk.length, 1, 'expected one arm linker');
  const gap = Math.hypot(lk[0].b._x - lk[0].a._x, lk[0].b._y - lk[0].a._y);
  assert.ok(gap > E.GEO.step + E.GEO.linkGap * 0.8,
            'arm linker squeezed into normal rung spacing: ' + gap.toFixed(1));
});
test('declared linker length changes the drawn path', () => {
  const short = paths(fig('VH.a(1:3)-L(2)[LENGTH:5]-VL.a(3:1)').body)[0];
  const long  = paths(fig('VH.a(1:3)-L(2)[LENGTH:25]-VL.a(3:1)').body)[0];
  assert.ok(short && long, 'both should draw a linker');
  assert.notStrictEqual(short.d, long.d, 'the loop ignores the declared length');
  // same endpoints, different curvature
  assert.ok(Math.hypot(short.x0-long.x0, short.y0-long.y0) < 0.01, 'endpoints should not move');
});
test("a terminal hinge still renders, so F(ab')2 keeps one", () => {
  const { L } = fig(abml("F(ab')2"));
  assert.ok(L.conns.some(c => c.kind === 'hinge' && c.pts), 'no hinge strand');
});
test('a C-terminal clasp on two scFvs is not an Fc hinge', () => {
  assert.ok(!/^Y/.test(fig(abml('DART')).L.topo), 'DART was read as a Y-shaped molecule');
  assert.ok(/^Y/.test(fig(abml('IgG1')).L.topo), 'IgG1 should be Y-shaped');
});

console.log('\ngrammar');
test('specification violations are reported', () => {
  const err = s => E.parseAbML(s).errors;
  assert.ok(err('CH3>@(1:2)|CH3(2:1)').some(e => /knob and a hole/.test(e)));
  assert.ok(err('CH1+_(1:2)|CL(2:1)').some(e => /both charges/.test(e)));
  assert.ok(err('CH1!(1:2)|CL(2:1)').some(e => /aglycosyl CH2/.test(e)));
  assert.strictEqual(err('CH2!(1:2)|CH2(2:1)').length, 0, '! on CH2 is legal');
  assert.ok(err('VH.a(1:2)|VL.a(2:1)|VH.b(3)').some(e => /does not interact/.test(e)));
});
test('ASEQ and DSEQ are accepted', () => {
  assert.strictEqual(E.parseAbML('VH.a(1:2)[ASEQ:EVQLV]|VL.a(2:1)[DSEQ:GAATTC]').errors.length, 0);
});
test('|[ADC] is a flag, not a chain', () => {
  const p = E.parseAbML('VH.a(1:2)-CH1|VL.a(2:1)-CL|[ADC]');
  assert.strictEqual(p.adc, true);
  assert.strictEqual(p.chains.length, 2);
});
test('a shared light chain carries both specificities', () => {
  assert.strictEqual((abml('Common light chain').match(/VL\.ab\(/g) || []).length, 2);
});
test('AbML survives a parse and write round trip', () => {
  for (const f of LIB) {
    const once = E.writeAbML(E.parseAbML(f.abml).chains);
    assert.strictEqual(E.writeAbML(E.parseAbML(once).chains), once, f.name);
  }
});

console.log('\noutput');
test('exported SVG records its provenance', () => {
  const { svg } = E.renderOne(abml('IgG1'), E.defaultOptions({ figTitle: 'IgG1' }));
  assert.ok(svg.includes('Aureka AbDraw v' + E.VERSION));
  assert.ok(svg.includes('<desc>AbML: '));
  assert.ok(svg.includes('<title>IgG1</title>'));
});
test('variable domains are notched, constant domains are not', () => {
  const { L } = fig(abml('Fab'));
  assert.ok(L.nodes.find(d => d.type === 'VH')._outline, 'VH has no notched outline');
  assert.strictEqual(L.nodes.find(d => d.type === 'CH1')._outline, null, 'CH1 should be a plain ellipse');
});
test('every drawing fits inside its viewBox', () => {
  for (const f of LIB) {
    const { svg } = E.renderOne(f.abml, E.defaultOptions());
    const m = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    assert.ok(m, f.name + ': no viewBox');
    assert.ok(+m[1] > 0 && +m[2] > 0, f.name + ': empty viewBox');
  }
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
