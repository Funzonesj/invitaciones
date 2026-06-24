// ────────────────────────────────────────────────────────────────
// Mercado Pago — Cobro real verificado (Checkout Pro). UNA sola función:
//   POST /api/mp           → crea la preferencia, devuelve init_point (link de pago)
//   GET  /api/mp?ref=...    → verifica si el pago está APROBADO (por external_reference)
//   GET  /api/mp?payment_id=... → verifica por id de pago
// Usa MP_ACCESS_TOKEN (Vercel · Access Token, SECRETO).
// (Se unieron mp-crear + mp-estado en un archivo por el límite de 12 funciones de Vercel.)
// ────────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) { res.status(500).json({ error: 'Mercado Pago todavía no está configurado (falta MP_ACCESS_TOKEN en Vercel).' }); return; }

  try {
    // ── Crear preferencia de pago ──
    if (req.method === 'POST') {
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
      return;
    }

    // ── Verificar estado del pago ──
    const q = req.query || {};
    const ref = String(q.ref || '').slice(0, 120);
    const payId = String(q.payment_id || '').slice(0, 40);
    let approved = false, status = '', amount = 0;

    if (payId) {
      const r = await fetch('https://api.mercadopago.com/v1/payments/' + encodeURIComponent(payId), { headers: { Authorization: 'Bearer ' + token } });
      const d = await r.json().catch(() => ({}));
      status = d.status || '';
      approved = status === 'approved';
      amount = d.transaction_amount || 0;
    } else if (ref) {
      const r = await fetch('https://api.mercadopago.com/v1/payments/search?external_reference=' + encodeURIComponent(ref) + '&sort=date_created&criteria=desc', { headers: { Authorization: 'Bearer ' + token } });
      const d = await r.json().catch(() => ({}));
      const results = (d && d.results) || [];
      const ok = results.find(p => p.status === 'approved');
      if (ok) { approved = true; status = 'approved'; amount = ok.transaction_amount || 0; }
      else if (results[0]) { status = results[0].status || ''; }
    } else {
      res.status(400).json({ error: 'Falta ref o payment_id.' }); return;
    }

    res.status(200).json({ approved: approved, status: status, amount: amount });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
