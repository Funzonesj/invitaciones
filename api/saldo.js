// ────────────────────────────────────────────────────────────────
// Función serverless de Vercel — Saldo de crédito en fal.ai
// Lee el saldo de la cuenta usando la misma FAL_KEY (Settings → Env Vars).
// ────────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // El saldo (billing) necesita una clave con permiso de administración.
  // Usamos FAL_ADMIN_KEY si existe; si no, probamos con FAL_KEY.
  const key = process.env.FAL_ADMIN_KEY || process.env.FAL_KEY;
  if (!key) { res.status(500).json({ error: 'Falta la clave de fal en Vercel (FAL_ADMIN_KEY o FAL_KEY).' }); return; }

  try {
    const r = await fetch('https://api.fal.ai/v1/account/billing?expand=credits', {
      headers: { Authorization: 'Key ' + key },
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      let raw = '';
      if (d) {
        if (typeof d.detail === 'string') raw = d.detail;
        else if (d.detail && d.detail.message) raw = d.detail.message;
        else if (d.message) raw = d.message;
        else if (typeof d.error === 'string') raw = d.error;
      }
      const esPermiso = /not permitted|authorization|permission|forbidden/i.test(raw) || r.status === 401 || r.status === 403;
      const msg = esPermiso
        ? 'La clave de fal no tiene permiso para ver el saldo. Necesitás una clave Admin (cargala en Vercel como FAL_ADMIN_KEY).'
        : (raw || 'No se pudo leer el saldo.');
      res.status(r.status).json({ error: msg });
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
