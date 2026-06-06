// ────────────────────────────────────────────────────────────────
// Función serverless de Vercel — Generación de VIDEO con IA (fal.ai)
// Usa la COLA de fal.ai porque el video tarda 1-3 minutos:
//   - action 'submit'  -> encola el pedido y devuelve las URLs de seguimiento
//   - action 'status'  -> consulta si terminó; si terminó devuelve la URL del video
// La clave FAL_KEY se configura en Vercel (Settings → Environment Variables).
// ────────────────────────────────────────────────────────────────

const MODEL = 'fal-ai/kling-video/v3/pro/image-to-video';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Método no permitido' }); return; }

  const key = process.env.FAL_KEY;
  if (!key) { res.status(500).json({ error: 'El generador de video todavía no está configurado (falta la clave en Vercel).' }); return; }

  try {
    const body = req.body || {};
    const action = body.action || 'submit';

    // ── Consultar estado de un pedido ya encolado ──
    if (action === 'status') {
      const { statusUrl, responseUrl } = body;
      if (!statusUrl || !responseUrl) { res.status(400).json({ error: 'Faltan los datos de seguimiento.' }); return; }
      const sr = await fetch(statusUrl, { headers: { Authorization: 'Key ' + key } });
      const sd = await sr.json().catch(() => ({}));
      if (sd && sd.status === 'COMPLETED') {
        const rr = await fetch(responseUrl, { headers: { Authorization: 'Key ' + key } });
        const rd = await rr.json().catch(() => ({}));
        const url = rd && rd.video && rd.video.url;
        if (!url) { res.status(502).json({ error: 'El video terminó pero no se recibió el archivo.' }); return; }
        res.status(200).json({ done: true, url: url });
        return;
      }
      res.status(200).json({ done: false, status: (sd && sd.status) || 'IN_QUEUE' });
      return;
    }

    // ── Encolar un nuevo video ──
    const { image, prompt, duration, generate_audio } = body;
    if (!image) { res.status(400).json({ error: 'Falta la imagen de inicio para el video.' }); return; }
    const reqBody = {
      start_image_url: image,
      prompt: prompt || '',
      duration: String(duration || '5'),
      generate_audio: (generate_audio !== false),
      negative_prompt: 'blur, distort, and low quality',
    };
    const r = await fetch('https://queue.fal.run/' + MODEL, {
      method: 'POST',
      headers: { Authorization: 'Key ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = (d && d.error && (d.error.message || d.error)) || (d && d.detail) || 'No se pudo iniciar el video.';
      res.status(r.status).json({ error: typeof msg === 'string' ? msg : JSON.stringify(msg).slice(0, 300) });
      return;
    }
    res.status(200).json({
      request_id: d.request_id || null,
      statusUrl: d.status_url || null,
      responseUrl: d.response_url || null,
    });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
