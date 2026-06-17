// ────────────────────────────────────────────────────────────────
// Endpoint FAQ — Asistente del salón (ESTRICTO).
// La IA responde SOLO con la info que cargó el salón. Si la pregunta no está
// en esa info, contesta que no la tiene. Usa OPENAI_API_KEY (Vercel).
// ────────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Método no permitido' }); return; }

  const key = process.env.OPENAI_API_KEY;
  if (!key) { res.status(500).json({ error: 'El asistente todavía no está configurado (falta la clave en Vercel).' }); return; }

  try {
    const b = req.body || {};
    const pregunta = String(b.pregunta || '').slice(0, 1000);
    const info = String(b.info || '').slice(0, 12000);
    const salon = String(b.salon || 'el salón').slice(0, 120);
    const promptBase = String(b.prompt || '').slice(0, 3000);
    if (!pregunta) { res.status(400).json({ error: 'Falta la pregunta.' }); return; }
    if (!info.trim()) { res.status(200).json({ respuesta: 'No tengo esa información, consultá directamente con el salón.' }); return; }

    const reglaEstricta = promptBase || ('Sos el asistente de ' + salon + '. Respondé las preguntas del cliente usando ÚNICAMENTE la información de abajo. Si la respuesta no está en esa información, respondé exactamente: "No tengo esa información, consultá directamente con el salón." No inventes ni supongas nada. Respondé en español, de forma completa, clara y amable, sin cambiar los datos.');
    const sys = reglaEstricta + '\n\n=== INFORMACIÓN DEL SALÓN (' + salon + ') ===\n' + info;

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 500,
        messages: [{ role: 'system', content: sys }, { role: 'user', content: pregunta }],
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { res.status(r.status).json({ error: (d && d.error && d.error.message) || 'No se pudo responder.' }); return; }
    const respuesta = (d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || 'No tengo esa información, consultá directamente con el salón.';
    res.status(200).json({ respuesta: respuesta });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
