// ────────────────────────────────────────────────────────────────
// Función serverless de Vercel — Armar el VIDEO del recuerdo en el SERVIDOR (fal.ai ffmpeg)
// Junta imágenes (cada pantalla ya compuesta) + música en un MP4, sin grabar en vivo.
//   - action 'submit'  -> encola el armado y devuelve URLs de seguimiento
//   - action 'status'  -> consulta; si terminó devuelve la URL del video (MP4)
// Usa FAL_KEY (Vercel). Modelo: fal-ai/ffmpeg-api/compose.
// ────────────────────────────────────────────────────────────────

const MODEL = 'fal-ai/ffmpeg-api/compose';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Método no permitido' }); return; }

  const key = process.env.FAL_KEY;
  if (!key) { res.status(500).json({ error: 'El armado de video todavía no está configurado (falta la clave en Vercel).' }); return; }

  try {
    const body = req.body || {};
    const action = body.action || 'submit';

    if (action === 'status') {
      const { statusUrl, responseUrl } = body;
      if (!statusUrl || !responseUrl) { res.status(400).json({ error: 'Faltan los datos de seguimiento.' }); return; }
      const sr = await fetch(statusUrl, { headers: { Authorization: 'Key ' + key } });
      const sd = await sr.json().catch(() => ({}));
      if (sd && sd.status === 'COMPLETED') {
        const rr = await fetch(responseUrl, { headers: { Authorization: 'Key ' + key } });
        const rd = await rr.json().catch(() => ({}));
        const url = rd && (rd.video_url || (rd.video && rd.video.url));
        if (!url) { res.status(200).json({ failed: true, error: 'El video terminó pero no se recibió el archivo.' }); return; }
        res.status(200).json({ done: true, url: url });
        return;
      }
      if (sd && (sd.status === 'ERROR' || sd.status === 'FAILED')) {
        let detalle = '';
        try { const rr = await fetch(responseUrl, { headers: { Authorization: 'Key ' + key } }); const rd = await rr.json().catch(() => ({})); detalle = (rd && (rd.detail || rd.error || rd.message)) || ''; if (typeof detalle !== 'string') detalle = JSON.stringify(detalle).slice(0, 200); } catch (e) {}
        res.status(200).json({ failed: true, error: 'No se pudo armar el video.' + (detalle ? (' ' + detalle) : '') });
        return;
      }
      res.status(200).json({ done: false, status: (sd && sd.status) || 'IN_QUEUE' });
      return;
    }

    // ── Encolar el armado ──
    const { tracks } = body;
    if (!tracks || !Array.isArray(tracks) || !tracks.length) { res.status(400).json({ error: 'Faltan las imágenes para el video.' }); return; }
    const r = await fetch('https://queue.fal.run/' + MODEL, {
      method: 'POST',
      headers: { Authorization: 'Key ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tracks: tracks }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = (d && d.error && (d.error.message || d.error)) || (d && d.detail) || 'No se pudo iniciar el armado del video.';
      res.status(r.status).json({ error: typeof msg === 'string' ? msg : JSON.stringify(msg).slice(0, 300) });
      return;
    }
    res.status(200).json({ request_id: d.request_id || null, statusUrl: d.status_url || null, responseUrl: d.response_url || null });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
