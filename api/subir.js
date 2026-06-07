// ────────────────────────────────────────────────────────────────
// Función serverless de Vercel — Subir una imagen a la nube (fal storage)
// Recibe {image: dataURI} y devuelve {url}. Así el catálogo guarda el
// ENLACE (liviano) en lugar de la imagen entera (pesada).
// Usa FAL_KEY (Vercel).
// ────────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Método no permitido' }); return; }

  const key = process.env.FAL_KEY;
  if (!key) { res.status(500).json({ error: 'Falta la clave de fal en Vercel (FAL_KEY).' }); return; }

  try {
    const body = req.body || {};
    const image = body.image;
    if (!image || typeof image !== 'string') { res.status(400).json({ error: 'Falta la imagen.' }); return; }
    const m = image.match(/^data:(.*?);base64,(.*)$/);
    const ct = (m && m[1]) || 'image/jpeg';
    const b64 = m ? m[2] : image;
    const buf = Buffer.from(b64, 'base64');
    const ext = ct.indexOf('png') >= 0 ? 'png' : (ct.indexOf('webp') >= 0 ? 'webp' : 'jpg');

    const init = await fetch('https://rest.alpha.fal.ai/storage/upload/initiate', {
      method: 'POST',
      headers: { Authorization: 'Key ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content_type: ct, file_name: 'cat-' + Math.floor(Date.now()) + '.' + ext }),
    });
    if (!init.ok) { res.status(init.status).json({ error: 'No se pudo iniciar la subida.' }); return; }
    const id = await init.json().catch(() => ({}));
    if (!id || !id.upload_url || !id.file_url) { res.status(502).json({ error: 'Respuesta inválida de almacenamiento.' }); return; }
    const up = await fetch(id.upload_url, { method: 'PUT', headers: { 'Content-Type': ct }, body: buf });
    if (!up.ok) { res.status(up.status).json({ error: 'No se pudo subir la imagen.' }); return; }
    res.status(200).json({ url: id.file_url });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
