// ── Vista previa por evento (Open Graph) para los links de invitación ──────────
// Cuando alguien comparte  funzonepro.com/?inv=ev-XXXX  por WhatsApp, WhatsApp lee
// las etiquetas Open Graph del HTML para armar la tarjeta (imagen + título). Como la
// app es UNA sola página estática, sin esto la imagen sería siempre el ícono (la
// estrella). Acá inyectamos, por evento, la PORTADA elegida (el personaje/foto/IA) y
// el texto del cumple, para que la invitación llegue personalizada.
//
// Es un Edge Middleware (NO cuenta como función de Vercel, que están al límite de 12).
// A prueba de fallos: ante cualquier error, deja pasar la página normal (return).

export const config = { matcher: '/' };

const SB_URL = process.env.SB_URL || 'https://tnubhbtihssubnfpwuvu.supabase.co';
const SB_KEY = process.env.SB_SERVICE_ROLE || process.env.SB_ANON || '';
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function sbEvento(id) {
  const r = await fetch(SB_URL + '/rest/v1/eventos?id=eq.' + encodeURIComponent(id) + '&select=data', {
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY },
  });
  if (!r.ok) return null;
  const rows = await r.json();
  return (rows && rows[0] && rows[0].data) || null;
}

export default async function middleware(req) {
  try {
    // Evita el bucle: cuando pedimos la página base de vuelta, la dejamos pasar.
    if (req.headers.get('x-og-bypass')) return;
    if (!SB_KEY) return;

    const url = new URL(req.url);
    const evId = url.searchParams.get('inv') || url.searchParams.get('rec');
    if (!evId) return; // sólo personalizamos los links de invitación/recuerdos

    const ev = await sbEvento(evId);
    if (!ev) return;

    // Imagen: la portada elegida (personaje/foto/IA). Si no hay, la de la temática.
    let img = ev.portadaSrc || '';
    if (!img && ev.temId) {
      try {
        const tem = await sbEvento('__config_tematicas__');
        const arr = Array.isArray(tem) ? tem : [];
        const t = arr.find((x) => x && x.id === ev.temId);
        if (t && t.img) img = t.img;
      } catch (e) {}
    }
    // WhatsApp sólo puede bajar imágenes http(s) absolutas (no data: ni relativas).
    if (img && !/^https?:\/\//i.test(img)) img = '';
    if (!img) img = url.origin + '/icon-salon.png'; // reserva con la marca

    const nombre = (ev.nombre || '').toString().trim();
    const fecha = (ev.dia && ev.mes)
      ? (ev.dia + ' de ' + (MESES[(+ev.mes) - 1] || '') + (ev.anio ? (' de ' + ev.anio) : ''))
      : '';
    const titulo = nombre ? (nombre + ' te invita 🎉') : 'Fun Zone Pro';
    const desc = fecha ? ('¡Te esperamos el ' + fecha + '! Tocá para ver la invitación.') : 'Tocá para ver la invitación.';

    // Traemos la página base (sin re-disparar el middleware) y le inyectamos las etiquetas.
    const pageRes = await fetch(url.origin + '/', { headers: { 'x-og-bypass': '1' } });
    if (!pageRes.ok) return;
    let html = await pageRes.text();

    const tags =
      '<meta property="og:type" content="website"/>' +
      '<meta property="og:site_name" content="Fun Zone Pro"/>' +
      '<meta property="og:title" content="' + esc(titulo) + '"/>' +
      '<meta property="og:description" content="' + esc(desc) + '"/>' +
      '<meta property="og:image" content="' + esc(img) + '"/>' +
      '<meta property="og:url" content="' + esc(url.href) + '"/>' +
      '<meta name="twitter:card" content="summary_large_image"/>' +
      '<meta name="twitter:title" content="' + esc(titulo) + '"/>' +
      '<meta name="twitter:description" content="' + esc(desc) + '"/>' +
      '<meta name="twitter:image" content="' + esc(img) + '"/>';

    html = html.replace('</head>', tags + '</head>');

    return new Response(html, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=0, must-revalidate' },
    });
  } catch (e) {
    return; // ante cualquier error, la página carga normal
  }
}
