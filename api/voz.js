// ────────────────────────────────────────────────────────────────
// Función serverless de Vercel — Voz con ElevenLabs (texto → audio)
// Clave: ELEVENLABS_API_KEY (Vercel). Voces por género (con fallback fijo).
// Devuelve el audio como data URI (base64) para usarlo en el lip-sync.
// ────────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Método no permitido' }); return; }

  const key = process.env.ELEVENLABS_API_KEY;
  // Si no está configurada, avisamos sin romper (el front usa el audio de Kling).
  if (!key) { res.status(200).json({ configured: false }); return; }

  try {
    const body = req.body || {};
    const text = (body.text || '').trim();
    const genero = body.genero;
    if (!text) { res.status(400).json({ error: 'Falta el texto a decir.' }); return; }

    // Elegimos una voz INCLUIDA (premade) de la cuenta, según género (las premade funcionan en plan gratis).
    // Si la dueña pasa a plan pago, puede setear ELEVENLABS_VOICE_F/M con voces de librería (argentinas).
    const want = (genero === 'f') ? 'female' : 'male';
    let voice = (genero === 'f') ? process.env.ELEVENLABS_VOICE_F : process.env.ELEVENLABS_VOICE_M;
    if (!voice) {
      try {
        const lr = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key } });
        const ld = await lr.json().catch(() => ({}));
        const voices = (ld && ld.voices) || [];
        const premade = voices.filter(v => v.category === 'premade');
        const pool = premade.length ? premade : voices;
        const match = pool.find(v => v.labels && String(v.labels.gender || '').toLowerCase() === want) || pool[0];
        if (match) voice = match.voice_id;
      } catch (e) {}
    }
    if (!voice) voice = (genero === 'f') ? 'EXAVITQu4vr4xnSDxMaL' : 'pNInz6obpgDQGcFmaJgB';

    const r = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + voice, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true },
      }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      res.status(r.status).json({ error: (t && t.slice(0, 250)) || 'Error de ElevenLabs' });
      return;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    const b64 = buf.toString('base64');
    res.status(200).json({ configured: true, audio: 'data:audio/mpeg;base64,' + b64 });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
