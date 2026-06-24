// ────────────────────────────────────────────────────────────────
// Mercado Pago — Verificar estado del pago.
// Consulta a Mercado Pago si el pago (por external_reference o payment_id)
// está APROBADO de verdad, antes de generar la imagen/video.
// Usa MP_ACCESS_TOKEN (Vercel · SECRETO).
// ────────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) { res.status(500).json({ error: 'Mercado Pago no configurado (falta MP_ACCESS_TOKEN en Vercel).' }); return; }

  try {
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
