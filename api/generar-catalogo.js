// ────────────────────────────────────────────────────────────────
// Función serverless de Vercel — Generador de Catálogo (fal.ai)
// La clave FAL_KEY se configura en Vercel (Settings → Environment
// Variables). NUNCA va escrita en el código ni en el repositorio.
// ────────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Método no permitido' }); return; }

  const key = process.env.FAL_KEY;
  if (!key) {
    res.status(500).json({ error: 'El generador de catálogo todavía no está configurado (falta la clave en Vercel).' });
    return;
  }

  try {
    const body = req.body || {};
    const { prompt, image, model, size, isI2I } = body;
    if (!prompt || !model) { res.status(400).json({ error: 'Faltan datos (prompt o modelo).' }); return; }
    if (isI2I && !image) { res.status(400).json({ error: 'Para imagen→imagen hace falta subir una imagen.' }); return; }

    const reqBody = isI2I
      ? { prompt, image_url: image, image_size: size }
      : { prompt, image_size: size, num_images: 1 };

    const modelPath = String(model).replace('fal-ai/', '');
    const r = await fetch('https://fal.run/' + modelPath, {
      method: 'POST',
      headers: { Authorization: 'Key ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = (data && data.error && (data.error.message || data.error)) || (data && data.detail) || 'Error al generar la imagen.';
      res.status(r.status).json({ error: typeof msg === 'string' ? msg : JSON.stringify(msg).slice(0, 300) });
      return;
    }
    const url = (data.images && data.images[0] && data.images[0].url) || (data.image && data.image.url);
    if (!url) { res.status(502).json({ error: 'fal.ai no devolvió imagen. Probá otro modelo.' }); return; }
    res.status(200).json({ url });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
