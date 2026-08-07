// ────────────────────────────────────────────────────────────────
//  GATEWAY SEGURO a Supabase (app de salón).
//  Usa la clave SECRETA service_role (SB_SERVICE_ROLE en Vercel) para
//  leer/escribir la base. El navegador deja de tocar Supabase directo.
//
//  Autorización:
//   - Dueña: token de Supabase Auth (Bearer) verificado contra Supabase.
//   - Papá:  prueba la "clave" de SU evento (header x-evento-id / x-evento-pass).
//   - Invitado: lectura pública de UN evento, ya SANITIZADA (sin tel/DNI/clave).
//
//  ⚠️ Mientras SB_SERVICE_ROLE NO esté cargada en Vercel, devuelve 503 y la app
//     sigue usando su acceso actual (plan B). Así esto se puede subir sin romper nada.
//  ⚠️ PENDIENTE antes de activar RLS: dar login real (Supabase Auth) a las ENCARGADAS,
//     o el gateway no las va a autorizar para "load".
// ────────────────────────────────────────────────────────────────
const crypto  = require('crypto');
const SB_URL  = process.env.SB_URL || 'https://tnubhbtihssubnfpwuvu.supabase.co';
const SERVICE = process.env.SB_SERVICE_ROLE; // SECRETA (Vercel)
const ANON    = process.env.SB_ANON || 'sb_publishable_ZLLncEbfaSqZz15N6-MrXQ_g4K_ndB-';

// Token firmado para encargadas (no usan Supabase Auth). Se firma con la clave secreta del server.
function hmac(s){ return crypto.createHmac('sha256', SERVICE || 'x').update(String(s)).digest('hex'); }
function tokenEncargada(id){ return id + '.' + hmac('enc:' + id); }
function verifyEncargada(tok){
  if (!tok) return null;
  const t = String(tok); const i = t.lastIndexOf('.');
  if (i < 1) return null;
  const id = t.slice(0, i), sig = t.slice(i + 1), good = hmac('enc:' + id);
  try { if (sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return id; } catch (e) {}
  return null;
}

// Campos que NUNCA salen al invitado (link público de la tarjeta)
const CAMPOS_PRIVADOS = ['pass','user','clave','celPapa','dni','tel','telefono','encuesta'];

async function sbRest(path, opts){
  opts = opts || {};
  const headers = Object.assign({
    apikey: SERVICE,
    Authorization: 'Bearer ' + SERVICE,
    'Content-Type': 'application/json',
  }, opts.headers || {});
  const r = await fetch(SB_URL + '/rest/v1/' + path, { method: opts.method || 'GET', headers, body: opts.body });
  const txt = await r.text();
  let data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
  return { ok: r.ok, status: r.status, data };
}

// ── FOTOS AL DEPÓSITO (Supabase Storage) ────────────────────────
// Las fotos venían PEGADAS adentro de la base (base64): la tabla pesaba ~25 MB
// y la base se caía a cada rato. Acá se suben al Storage y en la base queda
// solo el link. El nombre del archivo sale del CONTENIDO (md5): subir la misma
// foto dos veces da el mismo archivo, así que nunca se duplica.
const BUCKET = 'fotos';
let _bucketOk = false;
async function asegurarBucket(){
  if (_bucketOk) return;
  try {
    const h = { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'Content-Type': 'application/json' };
    const r = await fetch(SB_URL + '/storage/v1/bucket/' + BUCKET, { headers: h });
    if (!r.ok) await fetch(SB_URL + '/storage/v1/bucket', { method: 'POST', headers: h, body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }) });
    _bucketOk = true;
  } catch (e) {}
}
function _md5(s){ return crypto.createHash('md5').update(s).digest('hex').slice(0, 12); }
async function subirBase64(prefijo, dataUri){
  const m = String(dataUri).match(/^data:([a-z]+\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!m) return null;
  const ct = m[1].toLowerCase();
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length) return null;
  const ext = ct.indexOf('png') >= 0 ? 'png' : ct.indexOf('webp') >= 0 ? 'webp' : ct.indexOf('gif') >= 0 ? 'gif'
    : ct.indexOf('mp4') >= 0 ? 'mp4' : ct.indexOf('webm') >= 0 ? 'webm' : ct.indexOf('mpeg') >= 0 ? 'mp3' : 'jpg';
  const path = prefijo + '/' + _md5(m[2]) + '.' + ext;
  await asegurarBucket();
  const up = await fetch(SB_URL + '/storage/v1/object/' + BUCKET + '/' + path, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'Content-Type': ct, 'x-upsert': 'true' },
    body: buf,
  });
  if (!up.ok) return null; // si falla, el base64 se queda como está (no se pierde nada)
  return SB_URL + '/storage/v1/object/public/' + BUCKET + '/' + path;
}
// Recorre el dato (hasta 4 niveles) y cambia cada foto/video pegado por su link.
// Devuelve { v: dato aligerado, n: cuántas subió }.
const B64_MIN = 20000; // ~15 KB reales: lo más chico no vale el viaje
async function aligerar(valor, prefijo, prof){
  prof = prof || 0;
  if (valor == null || prof > 4) return { v: valor, n: 0 };
  if (typeof valor === 'string') {
    if (valor.length > B64_MIN && /^data:(image|video|audio)\//i.test(valor)) {
      const url = await subirBase64(prefijo, valor);
      if (url) return { v: url, n: 1 };
    }
    return { v: valor, n: 0 };
  }
  if (Array.isArray(valor)) {
    let n = 0; const out = [];
    for (const x of valor) { const r = await aligerar(x, prefijo, prof + 1); out.push(r.v); n += r.n; }
    return { v: out, n };
  }
  if (typeof valor === 'object') {
    let n = 0; const out = {};
    for (const k of Object.keys(valor)) { const r = await aligerar(valor[k], prefijo, prof + 1); out[k] = r.v; n += r.n; }
    return { v: out, n };
  }
  return { v: valor, n: 0 };
}
function _prefijoDe(id){
  return (String(id).indexOf('__') === 0 ? 'config/' : 'ev/') + String(id).replace(/[^a-zA-Z0-9_-]/g, '');
}

// Verifica el token de Supabase Auth (dueña). Devuelve el user o null.
async function verificarDuena(jwt){
  if (!jwt) return null;
  try {
    const r = await fetch(SB_URL + '/auth/v1/user', { headers: { apikey: ANON, Authorization: 'Bearer ' + jwt } });
    if (!r.ok) return null;
    const u = await r.json().catch(() => null);
    return (u && u.id) ? u : null;
  } catch (e) { return null; }
}

function sanitizar(data){
  if (!data || typeof data !== 'object') return data;
  const out = {};
  for (const k of Object.keys(data)) { if (CAMPOS_PRIVADOS.indexOf(k) === -1) out[k] = data[k]; }
  return out;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-evento-id, x-evento-pass');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // Plan B: si todavía no está la clave secreta, la app sigue con su acceso actual.
  if (!SERVICE) { res.status(503).json({ error: 'gateway-no-config' }); return; }

  try {
    const b = (req.body && typeof req.body === 'object') ? req.body : {};
    const action = String(b.action || (req.query && req.query.action) || '');
    const jwt = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const evIdHdr = req.headers['x-evento-id'] || '';
    const evPassHdr = req.headers['x-evento-pass'] || '';

    // ── Invitado: lectura pública de UN evento, sanitizada ──
    if (action === 'invitacion') {
      const id = String(b.id || (req.query && req.query.id) || '');
      if (!id) { res.status(400).json({ error: 'falta id' }); return; }
      const r = await sbRest('eventos?id=eq.' + encodeURIComponent(id) + '&select=id,data');
      const row = (r.data && r.data[0]) || null;
      if (!row) { res.status(404).json({ error: 'no existe' }); return; }
      res.status(200).json({ id: row.id, data: sanitizar(row.data) });
      return;
    }

    // ── Ping: la app pregunta si el portero está activo (con la llave cargada) ──
    if (action === 'ping') { res.status(200).json({ ok: true }); return; }

    // ── Login de encargada: valida usuario/clave en el server y devuelve un token firmado ──
    if (action === 'loginEncargada') {
      const usuario = String(b.usuario || '').trim().toLowerCase();
      const clave = String(b.clave || '');
      if (!usuario) { res.status(400).json({ error: 'falta usuario' }); return; }
      const r = await sbRest('eventos?id=eq.__config_usuarios__&select=data');
      const arr = (r.data && r.data[0] && r.data[0].data) || [];
      const enc = Array.isArray(arr) ? arr.find(x => x && x.rol === 'encargada' && String(x.usuario || '').trim().toLowerCase() === usuario && String(x.clave || '') === clave) : null;
      if (!enc) { res.status(200).json({ ok: false }); return; }
      res.status(200).json({ ok: true, token: tokenEncargada(enc.id), id: enc.id, nombre: enc.nombre, sucursalId: enc.sucursalId });
      return;
    }

    // ── Login de papá: valida usuario+clave server-side y devuelve SU evento completo ──
    if (action === 'loginPapa') {
      const usuario = String(b.usuario || '').trim().toLowerCase();
      const clave = String(b.clave || '').trim().toLowerCase();
      if (!usuario || !clave) { res.status(400).json({ error: 'faltan datos' }); return; }
      // Que filtre la BASE, no el server: antes se bajaba la tabla ENTERA (~15 MB de fotos
      // en base64) en CADA intento de login, y eso volteaba a Postgres → el papá veía
      // "Datos incorrectos" cuando en realidad la base se había caído.
      // Traemos solo id+usuario de los candidatos (unos pocos bytes).
      const cand = await sbRest('eventos?select=id,u:data->>user&data->>user=ilike.' + encodeURIComponent(usuario));
      // Si la base está caída, r.data es un objeto de error: avisar en vez de decir "clave mal".
      if (!Array.isArray(cand.data)) { res.status(503).json({ error: 'base-no-disponible' }); return; }
      // OJO: ilike interpreta % y _ como comodines, así que la comparación que MANDA es
      // esta de acá (exacta, en JS). Sin esto, un usuario "%" entraría a cualquier evento.
      const ids = cand.data
        .filter(x => x && !String(x.id).startsWith('__') && String(x.u || '').trim().toLowerCase() === usuario)
        .map(x => x.id).slice(0, 5);
      let hit = null, hitId = '';
      for (const id of ids) {
        const one = await sbRest('eventos?id=eq.' + encodeURIComponent(id) + '&select=data');
        if (!Array.isArray(one.data)) { res.status(503).json({ error: 'base-no-disponible' }); return; }
        const ev = (one.data[0] && one.data[0].data) || null;
        if (ev && typeof ev === 'object' && String(ev.pass || '').trim().toLowerCase() === clave) { hit = ev; hitId = id; break; }
      }
      if (!hit) { res.status(200).json({ ok: false }); return; }
      const evId = hit.id || hitId;
      const cf = await sbRest('confs?select=data&data->>evId=eq.' + encodeURIComponent(evId));
      const confs = Array.isArray(cf.data) ? cf.data.map(x => x.data).filter(c => c && c.evId === evId) : [];
      res.status(200).json({ ok: true, ev: hit, confs: confs });
      return;
    }

    // ── Confirmar asistencia (RSVP) — PÚBLICO: el invitado guarda su confirmación ──
    if (action === 'addConf') {
      const c = b.c || {};
      if (!c || !c.id) { res.status(400).json({ error: 'falta id' }); return; }
      const r = await sbRest('confs', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ id: c.id, data: c }) });
      res.status(r.ok ? 200 : r.status).json({ ok: r.ok });
      return;
    }

    // ── ¿Quién es? ──
    const duena = await verificarDuena(jwt); // dueña logueada (Supabase Auth)
    const encargadaId = verifyEncargada(req.headers['x-encargada-token']); // encargada (token firmado)
    let papaOk = false;
    if (!duena && evIdHdr) {
      const r = await sbRest('eventos?id=eq.' + encodeURIComponent(evIdHdr) + '&select=data');
      const ev = (r.data && r.data[0] && r.data[0].data) || null;
      papaOk = !!(ev && ev.pass && String(ev.pass) === String(evPassHdr));
    }

    // ── Cargar TODO (dueña o encargada) ──
    // De a TANDAS chicas: un solo pedido con 150 eventos y las fotos adentro
    // (~25 MB) volteaba la base ("statement timeout" → 522 → el panel mostraba
    // "0 activos" como si no hubiera nada). En tandas de 25 la base respira.
    if (action === 'load') {
      if (!duena && !encargadaId) { res.status(401).json({ error: 'no autorizado' }); return; }
      const TANDA = 25;
      const eventos = [];
      for (let off = 0; off < 4000; off += TANDA) {
        const r = await sbRest('eventos?select=id,data&order=id&limit=' + TANDA + '&offset=' + off);
        if (!r.ok || !Array.isArray(r.data)) break;
        eventos.push.apply(eventos, r.data);
        if (r.data.length < TANDA) break;
      }
      const cf = await sbRest('confs?select=id,data');
      res.status(200).json({ eventos, confs: cf.data || [] });
      return;
    }

    // ── Leer UN evento (dueña, encargada o papá dueño de ese evento) ──
    if (action === 'evento') {
      const id = String(b.id || evIdHdr || '');
      if (!duena && !encargadaId && !(papaOk && id === String(evIdHdr))) { res.status(401).json({ error: 'no autorizado' }); return; }
      const r = await sbRest('eventos?id=eq.' + encodeURIComponent(id) + '&select=id,data');
      res.status(200).json({ row: (r.data && r.data[0]) || null });
      return;
    }

    // ── Guardar evento (dueña, encargada, o papá SOLO su propio evento) ──
    if (action === 'upsertEvento') {
      let ev = b.ev || {};
      if (!ev.id) { res.status(400).json({ error: 'falta id' }); return; }
      const esPapaDeEste = papaOk && String(ev.id) === String(evIdHdr);
      if (!duena && !encargadaId && !esPapaDeEste) { res.status(401).json({ error: 'no autorizado' }); return; }
      // Las fotos pegadas se van al depósito ANTES de guardar: la base queda
      // liviana para siempre, y si la subida falla el base64 se guarda igual.
      try { ev = (await aligerar(ev, _prefijoDe(ev.id))).v; } catch (e) {}
      const r = await sbRest('eventos', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ id: ev.id, data: ev }) });
      res.status(r.ok ? 200 : r.status).json({ ok: r.ok });
      return;
    }

    // ── Mudanza: aligerar una tanda de filas ya guardadas (dueña o encargada) ──
    // El panel la corre solo, de a poquito, hasta que no queda ninguna foto
    // pegada en la base. Re-correrla no hace nada (las filas ya livianas se saltean).
    if (action === 'migrarFotos') {
      if (!duena && !encargadaId) { res.status(401).json({ error: 'no autorizado' }); return; }
      const off = Math.max(0, Number(b.offset) || 0);
      const TANDA = 4;
      const r = await sbRest('eventos?select=id,data&order=id&limit=' + TANDA + '&offset=' + off);
      if (!Array.isArray(r.data)) { res.status(503).json({ error: 'base-no-disponible' }); return; }
      let cambiados = 0, subidas = 0;
      for (const row of r.data) {
        try {
          const lig = await aligerar(row.data, _prefijoDe(row.id));
          if (lig.n > 0) {
            // Se escribe ENSEGUIDA después de aligerar esa fila (ventana mínima
            // por si alguien la está editando justo en ese momento).
            const w = await sbRest('eventos', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ id: row.id, data: lig.v }) });
            if (w.ok) { cambiados++; subidas += lig.n; }
          }
        } catch (e) {}
      }
      res.status(200).json({ revisados: r.data.length, cambiados, subidas, fin: r.data.length < TANDA });
      return;
    }

    // ── Borrar evento (solo dueña) ──
    if (action === 'deleteEvento') {
      if (!duena) { res.status(401).json({ error: 'no autorizado' }); return; }
      const id = String(b.id || '');
      const r = await sbRest('eventos?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
      res.status(r.ok ? 200 : r.status).json({ ok: r.ok });
      return;
    }

    // ── Guardar configuración (solo dueña): confs o __config_*__ en eventos ──
    if (action === 'upsertConf' || action === 'upsertConfig') {
      const soloDuena = (action === 'upsertConfig'); // la config es solo de la dueña; confs también la encargada
      if (soloDuena ? !duena : (!duena && !encargadaId)) { res.status(401).json({ error: 'no autorizado' }); return; }
      const tabla = (action === 'upsertConf') ? 'confs' : 'eventos';
      const id = String(b.id || (b.c && b.c.id) || '');
      let data = (action === 'upsertConf') ? b.c : b.data;
      if (!id) { res.status(400).json({ error: 'falta id' }); return; }
      // La config también llevaba imágenes pegadas (temáticas, logos): al depósito.
      if (action === 'upsertConfig') { try { data = (await aligerar(data, _prefijoDe(id))).v; } catch (e) {} }
      const r = await sbRest(tabla, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ id: id, data: data }) });
      res.status(r.ok ? 200 : r.status).json({ ok: r.ok });
      return;
    }

    res.status(400).json({ error: 'accion desconocida' });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
