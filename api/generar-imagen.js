// ────────────────────────────────────────────────────────────────
// Función serverless de Vercel — Generación de imágenes con IA (OpenAI)
// La clave OPENAI_API_KEY se configura en Vercel (Settings → Environment
// Variables). NUNCA va escrita en el código ni en el repositorio.
// ────────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  // CORS básico (mismo origen, pero por las dudas)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Método no permitido' }); return; }

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    res.status(500).json({ error: 'El servicio de IA todavía no está configurado (falta la clave en Vercel).' });
    return;
  }

  try {
    // Vercel ya parsea el JSON del body
    const body = req.body || {};
    const { fotoNino, personaje, personajeNombre, prompt, n } = body;
    if (!fotoNino || !personaje) {
      res.status(400).json({ error: 'Faltan las imágenes (foto del niño/a y personaje).' });
      return;
    }

    // Convierte un data URL (base64) o una URL http(s) en un Blob para enviar a OpenAI
    async function toBlob(src) {
      if (typeof src !== 'string') throw new Error('Imagen inválida');
      if (src.startsWith('data:')) {
        const coma = src.indexOf(',');
        const meta = src.slice(0, coma);
        const b64 = src.slice(coma + 1);
        const mime = (meta.match(/data:(.*?);/) || [])[1] || 'image/png';
        return new Blob([Buffer.from(b64, 'base64')], { type: mime });
      } else {
        const r = await fetch(src);
        if (!r.ok) throw new Error('No se pudo descargar la imagen del personaje');
        const buf = Buffer.from(await r.arrayBuffer());
        const mime = r.headers.get('content-type') || 'image/jpeg';
        return new Blob([buf], { type: mime });
      }
    }

    const blobNino = await toBlob(fotoNino);
    const blobPers = await toBlob(personaje);

    // Prompt creativo: viene del panel administrativo (editable). Si no llega, usa uno por defecto.
    const creativo = (typeof prompt === 'string' && prompt.trim())
      ? prompt.trim()
      : ('Tengo dos imágenes adjuntas. Generá una foto vertical donde el niño/a de la primera imagen aparece con su cara real y fiel, abrazado junto a ' + (personajeNombre || 'el personaje') + ' (segunda imagen). El niño/a fotorrealista y el personaje en estilo animado 3D. Ambos sonriendo y felices, en un escenario de cumpleaños con globos y confeti, colores vibrantes y alegres. Encuadre de la cintura para arriba.');
    // Reglas técnicas fijas (siempre se agregan para que el resultado funcione con el cartel)
    const reglas = '\n\nReglas técnicas (no modificar): formato vertical 9:16; NO escribas ningún texto, cartel ni letras en la imagen; dejá un espacio libre en la parte superior; mantené la cara real y fiel del niño/a de la PRIMERA imagen, sin cartoonizar ni animar su rostro.';
    const finalPrompt = creativo + reglas;

    const cantidad = Math.min(Math.max(parseInt(n, 10) || 2, 1), 3);

    const fd = new FormData();
    fd.append('model', 'gpt-image-1');
    fd.append('image[]', blobNino, 'nino.png');
    fd.append('image[]', blobPers, 'personaje.png');
    fd.append('prompt', finalPrompt);
    fd.append('size', '1024x1536');
    fd.append('quality', 'high');
    fd.append('n', String(cantidad));

    const r = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key },
      body: fd,
    });
    const data = await r.json();
    if (!r.ok) {
      const msg = (data && data.error && data.error.message) || 'Error al generar la imagen.';
      res.status(r.status).json({ error: msg });
      return;
    }
    const imagenes = (data.data || []).map(d => 'data:image/png;base64,' + d.b64_json);
    if (!imagenes.length) { res.status(502).json({ error: 'OpenAI no devolvió imágenes.' }); return; }
    res.status(200).json({ imagenes });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
