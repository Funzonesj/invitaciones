// ────────────────────────────────────────────────────────────────
// Mercado Pago — Crear preferencia de pago (Checkout Pro).
// Devuelve el init_point (link de pago) para abrir en una pestaña.
// Usa MP_ACCESS_TOKEN (Vercel · Access Token de producción, SECRETO).
// ────────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Método no permitido' }); return; }

  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) { res.status(500).json({ error: 'Mercado Pago todavía no está configurado (falta MP_ACCESS_TOKEN en Vercel).' }); return; }

  try {
    const b = req.body || {};
    const precio = Number(b.precio || 0);
    const titulo = String(b.titulo || 'Generación IA Fun Zone').slice(0, 250);
    const ref = String(b.ref || '').slice(0, 120);
    const backUrl = String(b.backUrl || '').slice(0, 500);
    if (!(precio > 0)) { res.status(400).json({ error: 'Precio inválido.' }); return; }

    const pref = {
      items: [{ title: titulo, quantity: 1, unit_price: precio, currency_id: 'ARS' }],
      external_reference: ref,
      statement_descriptor: 'FUNZONE',
    };
    // auto_return solo es válido si hay back_url.success
    if (backUrl) {
      pref.back_urls = { success: backUrl, failure: backUrl, pending: backUrl };
      pref.auto_return = 'approved';
    }

    const r = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(pref),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { res.status(r.status).json({ error: (d && d.message) || 'No se pudo crear el pago en Mercado Pago.' }); return; }
    res.status(200).json({ init_point: d.init_point || d.sandbox_init_point, id: d.id, ref: ref });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
