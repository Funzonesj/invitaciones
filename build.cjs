/* Compila los *.src.html (JSX en <script type="text/babel">) a los *.html publicables
 * (JSX ya compilado a React.createElement, sin el babel-standalone del navegador).
 *
 *   node build.cjs            → compila fichaje e index (si existen)
 *   node build.cjs fichaje    → sólo fichaje
 *   node build.cjs index      → sólo index
 *
 * Requiere: npm install --no-save @babel/standalone
 */
const fs = require('fs');
const path = require('path');
const babel = require('@babel/standalone');

function build(srcFile, outFile) {
  if (!fs.existsSync(srcFile)) { console.log('(salteo, no existe)', srcFile); return; }
  let html = fs.readFileSync(srcFile, 'utf8');

  // 1) Quitar el <script ...babel...></script> del CDN (en publicable no se compila en el navegador)
  html = html.replace(/[ \t]*<script[^>]*babel[^>]*><\/script>\s*\n?/ig, '');

  // 2) Compilar el bloque <script type="text/babel"> … </script>
  const m = html.match(/<script type="text\/babel">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('No encontré <script type="text/babel"> en ' + srcFile);
  const jsx = m[1];
  const out = babel.transform(jsx, {
    presets: [['react', { runtime: 'classic' }]],
    filename: path.basename(srcFile),
    compact: false,
    comments: true,
  }).code;

  // OJO: usar función de reemplazo. Un reemplazo de tipo string interpreta $&, $', $1…
  // y el código compilado contiene '$' (peso), lo que truncaría el archivo.
  html = html.replace(m[0], () => '<script>\n' + out + '\n</script>');
  fs.writeFileSync(outFile, html);
  console.log('✓ generado', outFile, '(' + html.length + ' bytes)');
}

const arg = (process.argv[2] || '').toLowerCase();
const jobs = [];
if (!arg || arg === 'fichaje') jobs.push(['fichaje.src.html', 'fichaje.html']);
if (!arg || arg === 'index')   jobs.push(['index.src.html', 'index.html']);
if (!jobs.length) { console.error('Uso: node build.cjs [fichaje|index]'); process.exit(1); }
jobs.forEach(([s, o]) => build(s, o));
