/* Pre-render every library format to a standalone SVG, straight from the engine. */
const fs = require('fs'), path = require('path');
const E = require('../src/engine.js');

const ROOT = path.join(__dirname, '..');
const F = JSON.parse(fs.readFileSync(path.join(ROOT, 'formats.json'), 'utf8'));
const slug = n => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const out = path.join(ROOT, 'assets', 'svg');

fs.mkdirSync(out, { recursive: true });
const opt = E.defaultOptions({ scale: 1.5 });
let n = 0;
for (const f of F) {
  const { svg, parsed } = E.renderOne(f.abml, Object.assign({}, opt, { figTitle: f.name }));
  if (parsed.errors.length) {
    console.error('! ' + f.name + ': ' + parsed.errors.join('; '));
    process.exitCode = 1;
  }
  fs.writeFileSync(path.join(out, slug(f.name) + '.svg'), svg);
  n++;
}
console.log('wrote ' + n + ' SVGs');
