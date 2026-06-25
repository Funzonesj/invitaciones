// Control de origen para endpoints que cuestan crédito (fal/OpenAI).
// Solo deja pasar pedidos que vienen de la PROPIA app (mismo dominio o *.vercel.app).
// Bloquea llamadas de otros sitios o scripts (curl) que quieran gastar tu crédito.
// (Archivo con guion bajo: Vercel NO lo cuenta como función ni lo publica como ruta.)
module.exports = function origenOk(req) {
  const host = (req.headers.host || '').toLowerCase();
  const o = req.headers.origin || req.headers.referer || '';
  if (!o) return false; // sin origen (curl/script) → bloquear
  try {
    const oh = new URL(o).host.toLowerCase();
    return oh === host || oh.endsWith('.vercel.app');
  } catch (e) { return false; }
};
