/* Pre-render every library format to a standalone SVG for the gallery. */
const {chromium} = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const F = JSON.parse(fs.readFileSync(path.join(ROOT, 'formats.json'), 'utf8'));
const slug = n => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('file://' + path.join(ROOT, 'app', 'index.html'));
  await p.waitForTimeout(500);
  const out = await p.evaluate(F => {
    const o = {pal: PALETTES.aureka, tint: 'type', labels: true, showSpec: false,
               hingeLabel: false, linkLabel: false, ids: false, notes: false, ss: true,
               arrows: false, lw: 1.6, armAngle: 30, scale: 1.5, bg: null, ink: '#000000'};
    return F.map(f => renderOne(f.abml, o).svg);
  }, F);
  out.forEach((svg, i) => fs.writeFileSync(path.join(ROOT, 'assets', 'svg', slug(F[i].name) + '.svg'), svg));
  console.log('wrote ' + out.length + ' SVGs');
  await b.close();
})();
