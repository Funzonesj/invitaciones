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
      const r = await sbRest('eventos?select=id,data');
      const rows = (r.data || []);
      const hit = rows.find(x => x.data && typeof x.data === 'object' && !String(x.id).startsWith('__')
        && String(x.data.user || '').trim().toLowerCase() === usuario
        && String(x.data.pass || '').trim().toLowerCase() === clave);
      if (!hit) { res.status(200).json({ ok: false }); return; }
      const cf = await sbRest('confs?select=data');
      const confs = ((cf.data || []).map(x => x.data)).filter(c => c && c.evId === hit.data.id);
      res.status(200).json({ ok: true, ev: hit.data, confs: confs });
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
    if (action === 'load') {
      if (!duena && !encargadaId) { res.status(401).json({ error: 'no autorizado' }); return; }
      const ev = await sbRest('eventos?select=id,data');
      const cf = await sbRest('confs?select=id,data');
      res.status(200).json({ eventos: ev.data || [], confs: cf.data || [] });
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
      const ev = b.ev || {};
      if (!ev.id) { res.status(400).json({ error: 'falta id' }); return; }
      const esPapaDeEste = papaOk && String(ev.id) === String(evIdHdr);
      if (!duena && !encargadaId && !esPapaDeEste) { res.status(401).json({ error: 'no autorizado' }); return; }
      const r = await sbRest('eventos', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ id: ev.id, data: ev }) });
      res.status(r.ok ? 200 : r.status).json({ ok: r.ok });
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
      const data = (action === 'upsertConf') ? b.c : b.data;
      if (!id) { res.status(400).json({ error: 'falta id' }); return; }
      const r = await sbRest(tabla, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ id: id, data: data }) });
      res.status(r.ok ? 200 : r.status).json({ ok: r.ok });
      return;
    }

    res.status(400).json({ error: 'accion desconocida' });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
