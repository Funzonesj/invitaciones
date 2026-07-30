// ────────────────────────────────────────────────────────────────
// Mercado Pago — Cobro real verificado (Checkout Pro). UNA sola función:
//   POST /api/mp           → crea la preferencia, devuelve init_point (link de pago)
//   GET  /api/mp?ref=...    → verifica si el pago está APROBADO (por external_reference)
//   GET  /api/mp?payment_id=... → verifica por id de pago
// Usa MP_ACCESS_TOKEN (Vercel · Access Token, SECRETO).
// (Se unieron mp-crear + mp-estado en un archivo por el límite de 12 funciones de Vercel.)
// ────────────────────────────────────────────────────────────────
const PAGOS = require('./_pagos');

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
      const titulo = String(b.titulo || 'Generación IA Fun Zone').slice(0, 250);
      const ref = String(b.ref || '').slice(0, 120);
      const backUrl = String(b.backUrl || '').slice(0, 500);
      const evId = String(b.evId || b.eventId || '').slice(0, 80);
      const tipo = (String(b.tipo || 'imagen') === 'video') ? 'video' : 'imagen';
      if (!ref) { res.status(400).json({ error: 'Falta la referencia del pago.' }); return; }
      if (!evId) { res.status(400).json({ error: 'Falta el evento.' }); return; }

      // El PRECIO sale del panel de administración, NO del navegador.
      // Antes venía en el body: el papá podía mandar precio:1 y pagar $1 por el pack.
      const cfg = await PAGOS.configIA();
      const precio = (tipo === 'video') ? cfg.precioVideo : cfg.precioImagen;
      const cantidad = (tipo === 'video') ? 1 : cfg.packImagenes;
      if (!(precio > 0)) { res.status(400).json({ error: 'El precio no está configurado en el panel de administración.' }); return; }

      // Anotar la intención ANTES de mandar a pagar, con el precio y el pack de este momento.
      const anotado = await PAGOS.registrarIntento(evId, ref, tipo, precio, cantidad);
      if (!anotado) { res.status(503).json({ error: 'No se pudo registrar el pago. Probá de nuevo en un momento.' }); return; }

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
      res.status(200).json({ init_point: d.init_point || d.sandbox_init_point, id: d.id, ref: ref, precio: precio, cantidad: cantidad });
      return;
    }

    // ── Verificar estado del pago ──
    // Ahora pasa por _pagos.confirmar, que además de "aprobado" comprueba que el
    // MONTO alcance el precio del panel y deja el pago anotado del lado del servidor
    // (es lo que después habilita a generar). Antes solo miraba `approved` y el papá
    // podía pagar $1 para desbloquear el pack completo.
    const q = req.query || {};
    const ref = String(q.ref || '').slice(0, 120);
    const evId = String(q.evId || '').slice(0, 80);
    if (!ref) { res.status(400).json({ error: 'Falta ref.' }); return; }

    if (evId) {
      const c = await PAGOS.confirmar(evId, ref);
      if (c.ok) { res.status(200).json({ approved: true, status: 'approved', restantes: c.restantes }); return; }
      if (c.motivo === 'monto-insuficiente') {
        res.status(200).json({ approved: false, status: 'monto-insuficiente', error: 'El monto pagado ($' + (c.monto || 0) + ') no cubre el precio ($' + (c.esperado || 0) + ').' });
        return;
      }
      res.status(200).json({ approved: false, status: c.motivo || 'no-aprobado' });
      return;
    }

    // Compatibilidad: consulta sin evento (solo informa, NO habilita a generar).
    const r = await fetch('https://api.mercadopago.com/v1/payments/search?external_reference=' + encodeURIComponent(ref) + '&sort=date_created&criteria=desc', { headers: { Authorization: 'Bearer ' + token } });
    const d = await r.json().catch(() => ({}));
    const results = (d && d.results) || [];
    const ok = results.find(p => p.status === 'approved');
    res.status(200).json({
      approved: !!ok,
      status: ok ? 'approved' : ((results[0] && results[0].status) || ''),
      amount: ok ? (ok.transaction_amount || 0) : 0,
    });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
