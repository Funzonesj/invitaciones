// ────────────────────────────────────────────────────────────────
// Función serverless de Vercel — Saldo de crédito en fal.ai
// Lee el saldo de la cuenta usando la misma FAL_KEY (Settings → Env Vars).
// ────────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const key = process.env.FAL_KEY;
  if (!key) { res.status(500).json({ error: 'Falta la clave de fal en Vercel (FAL_KEY).' }); return; }

  try {
    const r = await fetch('https://api.fal.ai/v1/account/billing?expand=credits', {
      headers: { Authorization: 'Key ' + key },
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = (d && (d.detail || d.error)) || 'No se pudo leer el saldo (puede que la clave no tenga permiso de facturación).';
      res.status(r.status).json({ error: typeof msg === 'string' ? msg : JSON.stringify(msg).slice(0, 200) });
      return;
    }
    const bal = d && d.credits && d.credits.current_balance;
    res.status(200).json({
      balance: (typeof bal === 'number' ? bal : null),
      currency: (d && d.credits && d.credits.currency) || 'USD',
      username: (d && d.username) || null,
    });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
