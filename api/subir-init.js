// ────────────────────────────────────────────────────────────────
// Función serverless de Vercel — Iniciar una subida DIRECTA a la nube (fal storage)
// Devuelve {upload_url, file_url}. El navegador después hace un PUT del archivo
// directamente a upload_url (sin pasar por Vercel), así no hay límite de tamaño
// y se pueden subir videos pesados. Usa FAL_KEY (Vercel).
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
    const ct = (typeof body.content_type === 'string' && body.content_type) || 'application/octet-stream';
    const ext = (typeof body.ext === 'string' && body.ext) || 'bin';
    const init = await fetch('https://rest.alpha.fal.ai/storage/upload/initiate', {
      method: 'POST',
      headers: { Authorization: 'Key ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content_type: ct, file_name: 'up-' + Math.floor(Date.now()) + '.' + ext }),
    });
    if (!init.ok) { res.status(init.status).json({ error: 'No se pudo iniciar la subida.' }); return; }
    const id = await init.json().catch(() => ({}));
    if (!id || !id.upload_url || !id.file_url) { res.status(502).json({ error: 'Respuesta inválida de almacenamiento.' }); return; }
    res.status(200).json({ upload_url: id.upload_url, file_url: id.file_url });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
