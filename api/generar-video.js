// ────────────────────────────────────────────────────────────────
// Función serverless de Vercel — Generación de VIDEO con IA (fal.ai)
// Usa la COLA de fal.ai porque el video tarda 1-3 minutos:
//   - action 'submit'  -> encola el pedido y devuelve las URLs de seguimiento
//   - action 'status'  -> consulta si terminó; si terminó devuelve la URL del video
// La clave FAL_KEY se configura en Vercel (Settings → Environment Variables).
// ────────────────────────────────────────────────────────────────

const MODEL = 'fal-ai/kling-video/v3/pro/image-to-video';

const origenOk = require('./_origen');
const PAGOS = require('./_pagos');
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Método no permitido' }); return; }
  if (!origenOk(req)) { res.status(403).json({ error: 'Origen no permitido' }); return; }

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
        if (!url) { res.status(200).json({ failed: true, error: 'El video terminó pero no se recibió el archivo. Probá generarlo de nuevo.' }); return; }
        // El regalo se marca como usado recién cuando el video salió BIEN
        // (si falla, el papá lo puede volver a intentar sin perderlo).
        const evIdOk = String(body.evId || '').slice(0, 80);
        if (evIdOk) { try { await PAGOS.marcarVideoRegalo(evIdOk); } catch (e) {} }
        res.status(200).json({ done: true, url: url });
        return;
      }
      // Si Kling falló (ERROR/FAILED), traemos el detalle y avisamos en vez de esperar para siempre.
      if (sd && (sd.status === 'ERROR' || sd.status === 'FAILED')) {
        let detalle = '';
        try { const rr = await fetch(responseUrl, { headers: { Authorization: 'Key ' + key } }); const rd = await rr.json().catch(() => ({})); detalle = (rd && (rd.detail || rd.error || rd.message)) || ''; if (typeof detalle !== 'string') detalle = JSON.stringify(detalle).slice(0, 200); } catch (e) {}
        const low = String(detalle).toLowerCase();
        let msg = 'El video no se pudo generar.';
        if (low.indexOf('moderat') >= 0 || low.indexOf('nsfw') >= 0 || low.indexOf('policy') >= 0 || low.indexOf('content') >= 0 || low.indexOf('sensitive') >= 0) {
          msg = 'El video fue rechazado por el filtro de contenido (a veces pasa con fotos de chicos). Probá con OTRA foto del niño/a (cara bien visible, con buena luz) o con otra imagen elegida.';
        } else if (detalle) {
          msg = 'El video no se pudo generar: ' + detalle;
        }
        res.status(200).json({ failed: true, error: msg });
        return;
      }
      res.status(200).json({ done: false, status: (sd && sd.status) || 'IN_QUEUE' });
      return;
    }

    // ── Encolar un nuevo video ──
    const { image, prompt, duration, generate_audio } = body;
    if (!image) { res.status(400).json({ error: 'Falta la imagen de inicio para el video.' }); return; }

    // ── PUERTA DEL REGALO ──
    // El video es el REGALO por comprar el pack de imágenes (regla de la dueña):
    // sin pago aprobado no se genera. Cada video cuesta crédito de fal.ai, así que
    // sin esta puerta cualquiera con la cabecera Origin falsificada podía vaciar la
    // cuenta. El "una sola vez" se marca recién cuando el video sale bien (en 'status').
    const evId = String(body.evId || '').slice(0, 80);
    if (!evId) { res.status(402).json({ error: 'El video es un regalo por tu pack de imágenes. Primero hay que abonarlo.' }); return; }
    const regalo = await PAGOS.puedeVideoRegalo(evId);
    if (!regalo.ok) {
      const msg = regalo.motivo === 'regalo-ya-usado'
        ? 'Tu video de regalo ya fue generado.'
        : regalo.motivo === 'base-no-disponible'
          ? 'No pudimos verificar tu pack en este momento. Probá de nuevo en un minuto.'
          : 'El video es un regalo por tu pack de imágenes. Primero hay que abonarlo.';
      res.status(402).json({ error: msg, motivo: regalo.motivo });
      return;
    }
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
