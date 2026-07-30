// ────────────────────────────────────────────────────────────────
//  CONTROL DE PAGOS DE IA (server-side).
//
//  Por qué existe: antes los endpoints que gastan plata (generar-imagen,
//  generar-video) NO verificaban ningún pago — el único control era la cabecera
//  Origin, que se falsifica con una línea. Todo el "pagá antes de generar" vivía
//  en el navegador, donde el papá lo puede saltear. Esto lo mueve al servidor.
//
//  Regla del negocio (definida por la dueña):
//    - El papá PAGA por Mercado Pago → recibe N imágenes (N = packImagenes del
//      panel de administración) y el VIDEO DE REGALO.
//    - Sin pago aprobado no se genera nada.
//
//  Dónde se guarda: una fila por evento en la tabla `eventos`, con id
//  `__pago_<idEvento>__`. El prefijo `__` hace que el front la ignore como evento,
//  y el portero (api/db.js) solo deja escribir `__config_*__` a la dueña, así que
//  el papá NO puede tocar su propio estado de pago. Estas funciones escriben
//  directo con la clave de servicio.
//  Una fila por evento (en vez de una sola global) evita que dos papás pagando al
//  mismo tiempo se pisen la escritura.
//
//  (Archivo con guion bajo: Vercel NO lo cuenta como función. Estamos en el
//  límite de 12 funciones del plan Hobby, no agregar archivos sin guion bajo.)
// ────────────────────────────────────────────────────────────────
const crypto = require('crypto');
const SB_URL = process.env.SB_URL || 'https://tnubhbtihssubnfpwuvu.supabase.co';
const SERVICE = process.env.SB_SERVICE_ROLE;
const ANON = process.env.SB_ANON || 'sb_publishable_ZLLncEbfaSqZz15N6-MrXQ_g4K_ndB-';
const LLAVE = () => SERVICE || ANON;

// ── ¿Quien llama es la dueña o una encargada? ──
// Mismos tokens que usa el portero (api/db.js): la dueña con su sesión de Supabase
// Auth, la encargada con el token firmado. Sirve para que el panel de administración
// pueda generar imágenes del catálogo sin pasar por la puerta del pago del papá.
function verifyEncargada(tok) {
  if (!tok) return null;
  const t = String(tok); const i = t.lastIndexOf('.');
  if (i < 1) return null;
  const id = t.slice(0, i), sig = t.slice(i + 1);
  const good = crypto.createHmac('sha256', SERVICE || 'x').update('enc:' + id).digest('hex');
  try { if (sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return id; } catch (e) {}
  return null;
}
async function esAdmin(req) {
  try {
    if (verifyEncargada(req.headers['x-encargada-token'])) return true;
    const jwt = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (!jwt) return false;
    const r = await fetch(SB_URL + '/auth/v1/user', { headers: { apikey: ANON, Authorization: 'Bearer ' + jwt } });
    if (!r.ok) return false;
    const u = await r.json().catch(() => null);
    return !!(u && u.id);
  } catch (e) { return false; }
}

async function sb(path, opts) {
  opts = opts || {};
  const r = await fetch(SB_URL + '/rest/v1/' + path, {
    method: opts.method || 'GET',
    headers: Object.assign({
      apikey: LLAVE(),
      Authorization: 'Bearer ' + LLAVE(),
      'Content-Type': 'application/json',
    }, opts.headers || {}),
    body: opts.body,
  });
  const txt = await r.text();
  let data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
  return { ok: r.ok, status: r.status, data };
}

// ── Config del panel de administración (precios y tamaño del pack) ──
async function configIA() {
  const r = await sb('eventos?id=eq.__config_ia__&select=data');
  const d = (Array.isArray(r.data) && r.data[0] && r.data[0].data) || {};
  const nPack = parseInt(d.packImagenes, 10);
  return {
    precioImagen: Number(d.precioImagen) || 0,
    precioVideo: Number(d.precioVideo) || 0,
    // Cuántas imágenes entrega el pack. Configurable desde el panel; 2 por defecto.
    packImagenes: (nPack > 0 && nPack <= 20) ? nPack : 2,
  };
}

const filaId = (evId) => '__pago_' + String(evId) + '__';

async function leer(evId) {
  const r = await sb('eventos?id=eq.' + encodeURIComponent(filaId(evId)) + '&select=data');
  if (!Array.isArray(r.data)) return null; // base caída: distinguirlo de "no hay pagos"
  const d = r.data[0] && r.data[0].data;
  return (d && typeof d === 'object') ? d : { refs: {}, videoRegaloUsado: false };
}

async function guardar(evId, estado) {
  const r = await sb('eventos', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ id: filaId(evId), data: estado }),
  });
  return r.ok;
}

// ── Anotar la intención de pago al crear la preferencia de Mercado Pago ──
// Guarda el PRECIO y el TAMAÑO DEL PACK del momento, para que después no se
// pueda reclamar un pack más grande si la dueña cambia la config.
async function registrarIntento(evId, ref, tipo, precio, cantidad) {
  const est = await leer(evId);
  if (!est) return false;
  est.refs = est.refs || {};
  est.refs[ref] = { tipo: tipo, precio: precio, total: cantidad, usados: 0, pagado: false, ts: Date.now() };
  // Podar intentos viejos sin pagar (más de 7 días) para que la fila no crezca sin fin.
  const corte = Date.now() - 7 * 24 * 3600 * 1000;
  for (const k of Object.keys(est.refs)) {
    if (!est.refs[k].pagado && (est.refs[k].ts || 0) < corte) delete est.refs[k];
  }
  return guardar(evId, est);
}

// ── ¿Mercado Pago confirma este pago? Valida también el MONTO ──
// Sin el chequeo de monto, el papá pagaba $1 y desbloqueaba el pack completo.
async function verificarEnMP(ref, precioEsperado) {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) return { ok: false, motivo: 'mp-no-configurado' };
  try {
    const r = await fetch(
      'https://api.mercadopago.com/v1/payments/search?external_reference=' + encodeURIComponent(ref) + '&sort=date_created&criteria=desc',
      { headers: { Authorization: 'Bearer ' + token } }
    );
    const d = await r.json().catch(() => ({}));
    const aprobado = ((d && d.results) || []).find(p => p && p.status === 'approved');
    if (!aprobado) return { ok: false, motivo: 'no-aprobado' };
    const monto = Number(aprobado.transaction_amount || 0);
    if (precioEsperado > 0 && monto + 0.5 < precioEsperado) {
      return { ok: false, motivo: 'monto-insuficiente', monto: monto, esperado: precioEsperado };
    }
    return { ok: true, monto: monto };
  } catch (e) {
    return { ok: false, motivo: 'error-mp' };
  }
}

// ── Confirmar un pago y dejarlo listo para usar ──
async function confirmar(evId, ref) {
  const est = await leer(evId);
  if (!est) return { ok: false, motivo: 'base-no-disponible' };
  const p = est.refs && est.refs[ref];
  if (!p) return { ok: false, motivo: 'ref-desconocida' };
  if (p.pagado) return { ok: true, restantes: Math.max(0, p.total - p.usados), yaEstaba: true };
  const v = await verificarEnMP(ref, p.precio);
  if (!v.ok) return { ok: false, motivo: v.motivo, monto: v.monto, esperado: v.esperado };
  p.pagado = true; p.montoPagado = v.monto; p.tsPago = Date.now();
  await guardar(evId, est);
  return { ok: true, restantes: Math.max(0, p.total - p.usados) };
}

// ── Consumir cupos del pack (se llama DESPUÉS de generar de verdad) ──
async function consumir(evId, ref, n) {
  const est = await leer(evId);
  if (!est) return false;
  const p = est.refs && est.refs[ref];
  if (!p) return false;
  p.usados = Math.min(p.total, (p.usados || 0) + Math.max(1, n || 1));
  return guardar(evId, est);
}

// ── ¿Este pago habilita generar AHORA? (pagado + le quedan cupos) ──
async function puedeGenerar(evId, ref) {
  const est = await leer(evId);
  if (!est) return { ok: false, motivo: 'base-no-disponible' };
  const p = est.refs && est.refs[ref];
  if (!p) return { ok: false, motivo: 'sin-pago' };
  if (p.tipo !== 'imagen') return { ok: false, motivo: 'tipo-invalido' };
  if (!p.pagado) {
    // Puede que el papá vuelva de Mercado Pago sin que nadie haya confirmado todavía.
    const c = await confirmar(evId, ref);
    if (!c.ok) return { ok: false, motivo: c.motivo };
    return { ok: true, restantes: c.restantes };
  }
  const restantes = Math.max(0, p.total - (p.usados || 0));
  if (restantes <= 0) return { ok: false, motivo: 'pack-agotado' };
  return { ok: true, restantes: restantes };
}

// ── Video de REGALO: solo para quien pagó el pack de imágenes, una sola vez ──
async function puedeVideoRegalo(evId) {
  const est = await leer(evId);
  if (!est) return { ok: false, motivo: 'base-no-disponible' };
  const pago = Object.values(est.refs || {}).some(p => p && p.pagado && p.tipo === 'imagen');
  if (!pago) return { ok: false, motivo: 'sin-pago' };
  if (est.videoRegaloUsado) return { ok: false, motivo: 'regalo-ya-usado' };
  return { ok: true };
}

async function marcarVideoRegalo(evId) {
  const est = await leer(evId);
  if (!est) return false;
  est.videoRegaloUsado = true;
  return guardar(evId, est);
}

// ── Puerta única para los endpoints que gastan crédito ──
// Devuelve {ok} si el que llama tiene derecho a gastar: la dueña/encargada siempre,
// el papá solo con un pago aprobado (imágenes) o con su regalo disponible (video).
async function autorizarGasto(req, body) {
  if (await esAdmin(req)) return { ok: true, admin: true };
  const evId = String((body && body.evId) || '').slice(0, 80);
  const ref = String((body && body.ref) || '').slice(0, 120);
  if (!evId) return { ok: false, motivo: 'sin-pago' };
  return (body && body.paraVideo)
    ? await puedeVideoRegalo(evId)
    : await puedeGenerar(evId, ref);
}

function mensajeMotivo(motivo) {
  if (motivo === 'pack-agotado') return 'Ya usaste todas las imágenes de tu pack.';
  if (motivo === 'regalo-ya-usado') return 'Tu video de regalo ya fue generado.';
  if (motivo === 'monto-insuficiente') return 'El monto abonado no cubre el precio.';
  if (motivo === 'base-no-disponible') return 'No pudimos verificar el pago en este momento. Probá de nuevo en un minuto.';
  return 'Para generar primero hay que abonar.';
}

module.exports = {
  configIA, registrarIntento, confirmar, consumir,
  puedeGenerar, puedeVideoRegalo, marcarVideoRegalo,
  esAdmin, autorizarGasto, mensajeMotivo,
};
