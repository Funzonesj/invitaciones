// ────────────────────────────────────────────────────────────────
//  PORTERO SEGURO de la app de FICHAJE (control de horario).
//  Cierra las tablas fichaje_* (sueldos, claves, huellas) y deja que
//  cada rol acceda solo a lo suyo. Usa SB_SERVICE_ROLE (Vercel, secreto).
//
//  Acciones (POST /api/fichaje):
//   - login {usuario,clave}     → valida server-side, devuelve token firmado + su usuario (sin clave)
//   - all   {tabla}             → lee una tabla fichaje_* SCOPEADA por rol (header x-fichaje-token)
//   - insert {tabla,row}        → inserta (empleado solo su propio fichaje; resto: dueño/encargada)
//   - update {tabla,id,row}     → actualiza (dueño/encargada; empleado solo su fichaje)
//   - delete {tabla,id}         → borra (dueño/encargada)
//
//  ⚠️ Mientras SB_SERVICE_ROLE no esté en Vercel, devuelve 503 y la app usa su acceso actual (plan B).
// ────────────────────────────────────────────────────────────────
const crypto  = require('crypto');
const SB_URL  = process.env.SB_URL || 'https://tnubhbtihssubnfpwuvu.supabase.co';
const SERVICE = process.env.SB_SERVICE_ROLE;
const DUENA_EMAIL = (process.env.DUENA_EMAIL || 'lemmaservicios@gmail.com').toLowerCase();

function hmac(s){ return crypto.createHmac('sha256', SERVICE || 'x').update(String(s)).digest('hex'); }
function makeToken(p){ const b = Buffer.from(JSON.stringify(p)).toString('base64'); return b + '.' + hmac(b); }
function readToken(tok){
  if (!tok) return null;
  const t = String(tok); const i = t.lastIndexOf('.');
  if (i < 1) return null;
  const b = t.slice(0, i), sig = t.slice(i + 1), good = hmac(b);
  try { if (sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return JSON.parse(Buffer.from(b, 'base64').toString('utf8')); } catch (e) {}
  return null;
}
async function sbRest(path, opts){
  opts = opts || {};
  const headers = Object.assign({ apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'Content-Type': 'application/json' }, opts.headers || {});
  const r = await fetch(SB_URL + '/rest/v1/' + path, { method: opts.method || 'GET', headers, body: opts.body });
  const txt = await r.text(); let data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
  return { ok: r.ok, status: r.status, data };
}
// Campos de empleado que NO ve otro empleado (sueldo, clave, huella, usuario)
const EMP_PRIVADO = ['valor_hora', 'clave', 'facial_descriptor', 'usuario'];
function sinPrivados(e){ const o = {}; for (const k of Object.keys(e)) { if (EMP_PRIVADO.indexOf(k) === -1) o[k] = e[k]; } return o; }

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-fichaje-token');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (!SERVICE) { res.status(503).json({ error: 'gateway-no-config' }); return; }

  try {
    const b = (req.body && typeof req.body === 'object') ? req.body : {};
    const action = String(b.action || '');

    if (action === 'ping') { res.status(200).json({ ok: true }); return; }

    // ── Login (público): valida usuario/clave y devuelve token + usuario sin clave ──
    if (action === 'login') {
      const u = String(b.usuario || '').trim().toLowerCase(), p = String(b.clave || '');
      if (!u) { res.status(400).json({ error: 'falta usuario' }); return; }
      const r = await sbRest('fichaje_empleados?select=*');
      const emp = (r.data || []).find(x => x && x.activo !== false && String(x.usuario || '').trim().toLowerCase() === u && String(x.clave || '') === p);
      if (!emp) { res.status(200).json({ ok: false }); return; }
      const token = makeToken({ id: emp.id, rol: emp.rol_sistema || 'empleado', sucEnc: emp.sucursal_encargada || null, legajo: (emp.legajo != null ? emp.legajo : null) });
      const user = Object.assign({}, emp); delete user.clave;
      res.status(200).json({ ok: true, token: token, user: user });
      return;
    }

    // ── Login DUEÑA por email (Supabase Auth, mismas credenciales del salón) ──
    if (action === 'loginDuena') {
      const auth = String(req.headers['authorization'] || '');
      const jwt = auth.replace(/^Bearer\s+/i, '').trim();
      if (!jwt) { res.status(200).json({ ok: false }); return; }
      // verificar el JWT contra Supabase Auth
      const u = await fetch(SB_URL + '/auth/v1/user', { headers: { apikey: SERVICE, Authorization: 'Bearer ' + jwt } });
      if (!u.ok) { res.status(200).json({ ok: false }); return; }
      const usr = await u.json().catch(() => null);
      const email = String((usr && usr.email) || '').toLowerCase();
      if (!email || (DUENA_EMAIL && email !== DUENA_EMAIL)) { res.status(200).json({ ok: false, reason: 'no-duena' }); return; }
      // mapear al registro dueño de fichaje_empleados (para tener su id real en eventos, etc.)
      const r = await sbRest('fichaje_empleados?select=*&rol_sistema=eq.dueno&limit=1');
      const emp = (r.data && r.data[0]) || null;
      const id = emp ? emp.id : ('duena-' + email);
      const token = makeToken({ id: id, rol: 'dueno', sucEnc: null, legajo: (emp && emp.legajo != null ? emp.legajo : null) });
      const user = emp ? Object.assign({}, emp) : { id: id, nombre: 'Dueña', rol_sistema: 'dueno' };
      delete user.clave;
      res.status(200).json({ ok: true, token: token, user: user });
      return;
    }

    // ── A partir de acá, requiere token de sesión ──
    const ses = readToken(req.headers['x-fichaje-token']);
    if (!ses) { res.status(401).json({ error: 'no autorizado' }); return; }
    const rol = ses.rol || 'empleado';
    const esAdmin = (rol === 'dueno' || rol === 'encargada');

    const tabla = String(b.tabla || '');
    if (!/^fichaje_[a-z_]+$/.test(tabla)) { res.status(400).json({ error: 'tabla inválida' }); return; }

    // ── Leer una tabla (scopeado por rol) ──
    if (action === 'all') {
      const r = await sbRest(tabla + '?select=*');
      let rows = r.data || [];
      if (rol === 'empleado') {
        if (tabla === 'fichaje_empleados') {
          // su propio registro completo (necesita su huella p/ reconocimiento); de los demás, sin datos privados
          rows = rows.map(e => (e.id === ses.id) ? e : sinPrivados(e));
        } else if (tabla === 'fichaje_fichajes') {
          rows = rows.filter(x => x.empleado_id === ses.id);
        }
        // resto de tablas (eventos, evento_empleados, sucursales, config, alertas, bonuses): las necesita para ver sus turnos/sueldo; se devuelven (el cliente filtra lo suyo)
      }
      res.status(200).json({ rows: rows });
      return;
    }

    // ── Insertar ──
    if (action === 'insert') {
      const row = b.row || {};
      if (!esAdmin) {
        // un empleado SOLO puede registrar su propio fichaje
        if (tabla !== 'fichaje_fichajes') { res.status(401).json({ error: 'no autorizado' }); return; }
        row.empleado_id = ses.id; // forzar que sea él mismo
      }
      const r = await sbRest(tabla, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) });
      res.status(r.ok ? 200 : r.status).json({ row: (r.data && r.data[0]) || null, ok: r.ok });
      return;
    }

    // ── Actualizar ──
    if (action === 'update') {
      const id = String(b.id || ''); const row = b.row || {};
      if (!esAdmin) { res.status(401).json({ error: 'no autorizado' }); return; }
      const r = await sbRest(tabla + '?id=eq.' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify(row) });
      res.status(r.ok ? 200 : r.status).json({ ok: r.ok });
      return;
    }

    // ── Borrar (solo dueño/encargada) ──
    if (action === 'delete') {
      const id = String(b.id || '');
      if (!esAdmin) { res.status(401).json({ error: 'no autorizado' }); return; }
      const r = await sbRest(tabla + '?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
      res.status(r.ok ? 200 : r.status).json({ ok: r.ok });
      return;
    }

    res.status(400).json({ error: 'acción desconocida' });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
