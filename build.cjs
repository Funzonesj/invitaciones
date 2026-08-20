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

  // ── CANDADO: NADA QUE DEJE LA PANTALLA EN NEGRO ───────────────────────────
  // Este compilador SOLO convierte el JSX: todo lo demás sale tal cual. Si en
  // el código entra "?." o "??", el navegador de un celular viejo no puede LEER
  // el bloque entero: no muestra ningún error, muestra NEGRO. Pasó de verdad
  // (Lili 20/08: "no abre la tarjeta, le aparece la pantalla en negro, pero
  // cuando yo la abro sí me aparece"). Eso corta el compilado acá.
  const CORTAN = [
    // El "?." seguido de un NÚMERO no es código moderno: es un "si sí / si no"
    // con decimal (opacity: cargando?.6:1), y lo entienden todos. No cuenta.
    [/[\w)\]]\?\.(?![0-9])/, '?.  (encadenamiento opcional)'],
    [/\?\?[^=]/, '??  (fusion nula)'],
    [/(\?\?|\|\||&&)=/, '??= ||= &&=  (asignacion logica)'],
  ];
  for (const par of CORTAN) {
    const hit = out.match(par[0]);
    if (hit) {
      const linea = out.slice(0, hit.index).split('\n').length;
      throw new Error(
        'NO SE PUBLICA: en ' + path.basename(srcFile) + ' hay "' + par[1] + '" (linea ' + linea + ' del compilado).\n' +
        '  Eso deja la PANTALLA NEGRA en celulares viejos: no se puede leer NADA del codigo.\n' +
        '  Escribilo a la antigua:  a?.b  ->  (a || {}).b     a ?? b  ->  (a == null ? b : a)'
      );
    }
  }
  // Estas NO cortan: no impiden leer el codigo, solo fallan si esa linea llega
  // a ejecutarse en un celular muy viejo. Se avisan para tenerlas vistas.
  const AVISAN = [
    [/\.replaceAll\(/, '.replaceAll()'],
    [/\.flatMap\(|\.flat\(/, '.flat() / .flatMap()'],
    [/Object\.fromEntries/, 'Object.fromEntries()'],
    [/structuredClone/, 'structuredClone()'],
    [/crypto\.randomUUID/, 'crypto.randomUUID()'],
    [/Promise\.allSettled/, 'Promise.allSettled()'],
  ];
  AVISAN.forEach(function (par) {
    if (par[0].test(out)) console.log('  ! ' + path.basename(srcFile) + ' usa ' + par[1] + ' - anda en casi todos, pero no en los muy viejos');
  });

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
