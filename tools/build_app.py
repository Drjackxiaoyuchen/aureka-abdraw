#!/usr/bin/env python3
"""Assemble the single-file app from src/ and formats.json.

  src/shell.html   markup, styles, fonts
  formats.json     the format library, injected as data
  src/engine.js    parser, layout, renderer  (pure, also usable from Node)
  src/ui.js        state and wiring

Produces a self-contained HTML file with no build-time dependencies at runtime.
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
read = lambda *p: open(os.path.join(ROOT, *p)).read()

SKELETON_HEAD = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>
:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
body{margin:0;font:14px system-ui,-apple-system,sans-serif}
img{max-width:100%}
[hidden]{display:none!important}
</style>
</head>
<body>
"""

def library_script():
    fm = json.load(open(os.path.join(ROOT, 'formats.json')))
    out = ['"use strict";',
           '/* generated from formats.json by tools/build_formats.py - do not edit here */',
           'const LIBRARY = [']
    for f in fm:
        out.append(' {n:%s,c:%s,d:%s,a:%s},' % (json.dumps(f['name']), json.dumps(f['category']),
                                                json.dumps(f['description']), json.dumps(f['abml'])))
    out += ['].map(x => ({name:x.n, category:x.c, description:x.d, abml:x.a}));',
            'const byName = n => LIBRARY.find(f => f.name === n);',
            "const slug = n => n.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');"]
    return '\n'.join(out)

def body():
    return (read('src', 'shell.html')
            + '\n<script>\n' + library_script()  + '\n</script>\n'
            + '\n<script>\n' + read('src','engine.js') + '\n</script>\n'
            + '\n<script>\n' + read('src','ui.js')     + '\n</script>\n')

if __name__ == '__main__':
    b = body()
    os.makedirs(os.path.join(ROOT, 'app'), exist_ok=True)
    open(os.path.join(ROOT, 'app', 'index.html'), 'w').write(SKELETON_HEAD + b + '\n</body>\n</html>\n')
    print('app/index.html  %d KB' % (len(b) // 1024))
    # --artifact <path>: the same page without the document skeleton
    if len(sys.argv) > 2 and sys.argv[1] == '--artifact':
        open(sys.argv[2], 'w').write(b)
        print('artifact body ->', sys.argv[2])
