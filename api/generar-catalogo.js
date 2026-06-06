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
    const { prompt, image, images, model, size, aspect_ratio, isI2I, describir } = body;
    if (!prompt || !model) { res.status(400).json({ error: 'Faltan datos (prompt o modelo).' }); return; }

    // Paso opcional: describir el personaje de la imagen (para text-to-image, esquivando marcas)
    let finalPrompt = prompt;
    if (describir && image) {
      const okey = process.env.OPENAI_API_KEY;
      if (okey) {
        try {
          const vr = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + okey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [{ role: 'user', content: [
                { type: 'text', text: 'Describe the main character in this image in English, ONLY by physical features (hair, skin, eye color, clothing, colors, accessories, body type, pose). Do NOT name any known character, brand, franchise or person. One concise paragraph for an image generator.' },
                { type: 'image_url', image_url: { url: image } }
              ] }],
              max_tokens: 250
            })
          });
          const vd = await vr.json();
          const desc = vd && vd.choices && vd.choices[0] && vd.choices[0].message && vd.choices[0].message.content;
          if (desc && desc.trim()) finalPrompt = desc.trim() + '\n' + prompt;
        } catch (e) { /* si falla la descripción, seguimos con el prompt original */ }
      }
    }

    const esNano = String(model).includes('nano-banana');
    let reqBody;
    if (esNano) {
      const urls = (Array.isArray(images) && images.length) ? images.filter(Boolean) : (image ? [image] : []);
      if (!urls.length) { res.status(400).json({ error: 'Faltan imágenes.' }); return; }
      reqBody = { prompt: finalPrompt, image_urls: urls, num_images: 1, aspect_ratio: aspect_ratio || '9:16', output_format: 'jpeg' };
    } else if (isI2I) {
      if (!image) { res.status(400).json({ error: 'Para imagen→imagen hace falta subir una imagen.' }); return; }
      reqBody = { prompt: finalPrompt, image_url: image, image_size: size };
    } else {
      reqBody = { prompt: finalPrompt, image_size: size, num_images: 1 };
    }

    // fal.run necesita el ID COMPLETO del modelo (incluyendo "fal-ai/")
    let modelPath = String(model).trim();
    if (!modelPath.startsWith('fal-ai/')) modelPath = 'fal-ai/' + modelPath;
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
