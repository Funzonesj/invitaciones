// ────────────────────────────────────────────────────────────────
// Función serverless de Vercel — Unir (pegar) dos o más videos en uno
// solo, en orden, usando fal.ai (ffmpeg-api/merge-videos) por cola.
//   action 'submit' -> encola {videos:[urlA, urlB]} y devuelve seguimiento
//   action 'status' -> consulta; al terminar devuelve la URL del video final
// Clave: FAL_KEY (Vercel).
// ────────────────────────────────────────────────────────────────

const MODEL = 'fal-ai/ffmpeg-api/merge-videos';

const origenOk = require('./_origen');
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Método no permitido' }); return; }
  if (!origenOk(req)) { res.status(403).json({ error: 'Origen no permitido' }); return; }

  const key = process.env.FAL_KEY;
  if (!key) { res.status(500).json({ error: 'Falta la clave de fal en Vercel (FAL_KEY).' }); return; }

  try {
    const body = req.body || {};
    const action = body.action || 'submit';

    // ── Consultar estado ──
    if (action === 'status') {
      const { statusUrl, responseUrl } = body;
      if (!statusUrl || !responseUrl) { res.status(400).json({ error: 'Faltan datos de seguimiento.' }); return; }
      const sr = await fetch(statusUrl, { headers: { Authorization: 'Key ' + key } });
      const sd = await sr.json().catch(() => ({}));
      if (sd && sd.status === 'COMPLETED') {
        const rr = await fetch(responseUrl, { headers: { Authorization: 'Key ' + key } });
        const rd = await rr.json().catch(() => ({}));
        const url = (rd && rd.video && rd.video.url) || (rd && rd.url) || null;
        if (!url) { res.status(502).json({ error: 'La unión terminó pero no devolvió video.' }); return; }
        res.status(200).json({ done: true, url: url });
        return;
      }
      res.status(200).json({ done: false, status: (sd && sd.status) || 'IN_QUEUE' });
      return;
    }

    // ── Encolar la unión ──
    const videos = body.videos || body.video_urls;
    if (!Array.isArray(videos) || videos.length < 2) {
      res.status(400).json({ error: 'Hacen falta al menos dos videos para unir.' });
      return;
    }
    const reqBody = {
      video_urls: videos,
      resolution: body.resolution || 'portrait_16_9',
    };
    const r = await fetch('https://queue.fal.run/' + MODEL, {
      method: 'POST',
      headers: { Authorization: 'Key ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = (d && d.error && (d.error.message || d.error)) || (d && d.detail) || 'No se pudo iniciar la unión.';
      res.status(r.status).json({ error: typeof msg === 'string' ? msg : JSON.stringify(msg).slice(0, 250) });
      return;
    }
    res.status(200).json({ statusUrl: d.status_url || null, responseUrl: d.response_url || null });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
