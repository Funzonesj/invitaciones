# Chat interno tipo WhatsApp — Especificación técnica completa

Documento de construcción del chat (grupos, tiempo real, fotos, audios, permisos,
no leídos, avisos y push). Sirve para reimplementarlo en cualquier app React + Supabase.
Está escrito a partir de dos implementaciones reales y funcionando:

- **Churrería** (`churreria-control/`): React + Vite (archivos separados), **con login de Supabase**.
- **Fun Zone** (`fichaje.html`): React + Babel en un solo HTML, **sin login de Supabase** (sesión propia).

> Lo único que cambia entre apps es **de dónde sale el "usuario actual"** y **la seguridad (RLS)**.
> Todo lo demás (tablas, tiempo real, UI, lógica) es igual.

---

## 1. Arquitectura en una imagen

```
┌─ Supabase ──────────────────────────────────────────┐
│  Tablas:  chat_grupos · chat_miembros · chat_mensajes│
│  Realtime: publica chat_mensajes (INSERT)            │
│  Storage:  imágenes/audios (bucket o endpoint propio)│
└──────────────────────────────────────────────────────┘
        ▲ inserta msg            │ realtime INSERT
        │                        ▼
┌─ Cliente (React) ───────────────────────────────────┐
│  Estado global de chat (no leídos + aviso)           │
│   └─ 1 suscripción realtime a TODOS los mensajes     │
│  Lista de grupos  →  Conversación (1 sub por grupo)  │
│  Subida fotos/audios · Notificaciones · Permisos     │
└──────────────────────────────────────────────────────┘
```

**Dos niveles de tiempo real (clave):**
1. **Global** (vive siempre): una suscripción a *todos* los mensajes para el globo de no leídos
   y el cartelito de aviso, aunque no estés en la pantalla de chat.
2. **Por conversación** (mientras tenés un grupo abierto): otra suscripción filtrada a ese grupo,
   para que los mensajes aparezcan al instante en la conversación.

Un flag compartido (`grupoActivo`) evita que el nivel global "duplique" el aviso cuando ya
estás mirando ese grupo.

---

## 2. Modelo de datos (SQL)

### 2.1 Tablas (igual en ambas apps; cambian solo los nombres y a quién apunta el "miembro")

```sql
create table chat_grupos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  foto_url text,
  creado_por uuid,
  created_at timestamptz default now()
);

create table chat_miembros (
  grupo_id uuid references chat_grupos(id) on delete cascade,
  user_id  uuid,                 -- id del usuario actual (ver 2.3)
  puede_escribir boolean default true,   -- false = solo lectura
  ultimo_leido_at timestamptz default now(),
  primary key (grupo_id, user_id)
);

create table chat_mensajes (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid references chat_grupos(id) on delete cascade,
  user_id  uuid,
  texto text,
  tipo text default 'texto',     -- texto | foto | audio
  adjunto_url text,
  created_at timestamptz default now()
);
create index on chat_mensajes (grupo_id, created_at);
create index on chat_miembros (user_id);
```

### 2.2 Tiempo real (imprescindible)

```sql
-- Que los INSERT de mensajes lleguen al instante:
alter publication supabase_realtime add table chat_mensajes;
```

(Conviene envolverlo en un `do $$ ... $$` que chequee si ya está publicada, para que correrlo
dos veces no falle.)

### 2.3 Identidad del usuario y seguridad — LAS DOS VARIANTES

**Variante A — con login de Supabase (RLS activado).** El `user_id` = `auth.uid()`.
La base hace cumplir la seguridad:

```sql
alter table chat_grupos   enable row level security;
alter table chat_miembros enable row level security;
alter table chat_mensajes enable row level security;

-- helper: ¿soy miembro del grupo? (SECURITY DEFINER evita recursión de RLS)
create function es_miembro(p_grupo uuid) returns boolean
  language sql security definer stable set search_path=public as $$
  select exists(select 1 from chat_miembros where grupo_id=p_grupo and user_id=auth.uid());
$$;

create policy g_sel on chat_grupos for select to authenticated using (es_miembro(id));
create policy m_sel on chat_mensajes for select to authenticated using (es_miembro(grupo_id));
create policy m_ins on chat_mensajes for insert to authenticated
  with check (user_id=auth.uid() and es_miembro(grupo_id)
              and exists(select 1 from chat_miembros
                         where grupo_id=chat_mensajes.grupo_id and user_id=auth.uid() and puede_escribir));
-- (el dueño crea/administra grupos y miembros con políticas propias)
```

**Variante B — sin login de Supabase (RLS desactivado).** El `user_id` lo pone el cliente
desde su propia sesión (ej. el empleado logueado). La app accede con la **clave pública**:

```sql
alter table chat_grupos   disable row level security;
alter table chat_miembros disable row level security;
alter table chat_mensajes disable row level security;
```

> En la Variante B la seguridad es del lado del cliente (se confía en la app). Es lo que ya
> usaba Fun Zone para el resto de sus tablas. Endurecer antes de datos sensibles.

### 2.4 Storage de fotos/audios — dos opciones

- **Bucket de Supabase Storage** (lo usa la churrería): bucket público `chat`, se sube con
  `supabase.storage.from('chat').upload(path, file)` y se obtiene `getPublicUrl`.
- **Endpoint propio** (lo usa Fun Zone): `POST /api/subir` (imagen base64 → URL) y
  `POST /api/subir-init` (devuelve un PUT prefirmado para subir el audio).

---

## 3. El "cerebro": tiempo real global + no leídos + aviso

Se monta UNA vez (en un Context si usás archivos separados, o en el componente raíz `App`
si es single-file). Mantiene:

- `noLeidos`: `{ grupoId: cantidad }`
- `aviso`: `{ grupoId, grupo, autor, texto }` o `null`
- refs: `grupoActivo` (qué grupo está abierto), `misGrupos` (set de ids), nombres de grupos.

```js
// userId = id del usuario actual (auth.uid() o sesion.id según la variante)
// 1) Cargar mis grupos + contar no leídos
const { data } = await supabase.from('chat_miembros')
  .select('grupo_id, ultimo_leido_at, g:chat_grupos(nombre)')
  .eq('user_id', userId);
misGrupos.current = new Set(data.map(m => m.grupo_id));
const conteo = {};
await Promise.all(data.map(async m => {
  const { count } = await supabase.from('chat_mensajes')
    .select('id', { count:'exact', head:true })
    .eq('grupo_id', m.grupo_id)
    .gt('created_at', m.ultimo_leido_at)
    .neq('user_id', userId);
  conteo[m.grupo_id] = count || 0;
}));
setNoLeidos(conteo);

// 2) UNA suscripción a TODOS los mensajes nuevos
const canal = supabase.channel('chat-rt-' + userId)
  .on('postgres_changes',
      { event:'INSERT', schema:'public', table:'chat_mensajes' },
      (payload) => {
        const m = payload.new;
        if (m.user_id === userId) return;                 // es mío
        if (!misGrupos.current.has(m.grupo_id)) return;   // no es un grupo mío
        if (grupoActivo.current === m.grupo_id) {         // lo estoy mirando
          marcarLeido(m.grupo_id); return;
        }
        setNoLeidos(p => ({ ...p, [m.grupo_id]: (p[m.grupo_id]||0)+1 }));
        setAviso({ grupoId:m.grupo_id, grupo:nombreDe(m.grupo_id),
                   autor:nombreEmp(m.user_id), texto:preview(m) });
        notificar(nombreEmp(m.user_id), preview(m));      // notificación del sistema (ver §6)
      })
  .subscribe();
return () => supabase.removeChannel(canal);

// marcarLeido: pone el contador en 0 y actualiza ultimo_leido_at
async function marcarLeido(grupoId){
  setNoLeidos(p => ({ ...p, [grupoId]: 0 }));
  await supabase.from('chat_miembros')
    .update({ ultimo_leido_at: new Date().toISOString() })
    .eq('grupo_id', grupoId).eq('user_id', userId);
}
```

> `preview(m)` = `m.tipo==='texto' ? m.texto : m.tipo==='foto' ? '📷 Foto' : '🎤 Audio'`.

**⚠️ Bug real que encontramos y cómo se arregla (importante):**
Las suscripciones de Supabase se **acumulan** si el efecto se re-ejecuta y se re-suscribe con el
**mismo nombre de canal** (por StrictMode, cambios de dependencias, HMR). Resultado: el handler
se dispara N veces y, peor, queda atado a instancias "muertas" del componente cuyos `setState`
no hacen nada → el globo subía pero el aviso nunca aparecía. **Solución:**
1. Nombre de canal **único** por suscripción (ej. `'chat-rt-'+userId+'-'+(++seq)`).
2. Dependencias mínimas del efecto (solo el id del usuario).
3. Leer `empleados`, `marcarLeido`, etc. desde **refs**, no como dependencias.

---

## 4. Componentes de UI

### 4.1 Lista de chats + crear grupo (solo el dueño crea)

- Trae mis grupos: `chat_miembros.select('grupo_id, g:chat_grupos(...)').eq('user_id', userId)`.
- Muestra cada grupo con avatar (inicial), último mensaje (preview) y globo de no leídos.
- Botón "+ Grupo" (solo dueño) → modal: nombre + lista de empleados con checkbox **incluir** y
  checkbox **"habla"** (puede_escribir). Al crear: inserta el grupo y los miembros (incluido el
  creador con `puede_escribir:true`).

```js
async function crearGrupo(nombre, seleccionados){
  const g = await insert('chat_grupos', { nombre, creado_por:userId });
  const filas = [{ grupo_id:g.id, user_id:userId, puede_escribir:true }];
  seleccionados.forEach(e => filas.push({ grupo_id:g.id, user_id:e.id, puede_escribir:e.habla!==false }));
  await supabase.from('chat_miembros').insert(filas);
}
```

### 4.2 Conversación (texto / foto / audio / permisos / solo lectura)

Estructura: **panel fijo** que ocupa toda la pantalla; **solo la lista de mensajes scrollea**
(la barra de arriba y la de escribir quedan quietas — evita el "salto" de pantalla al enviar).

```jsx
// al montar:
useEffect(() => {
  grupoActivo.current = grupo.id;
  cargarMensajes();           // select * where grupo_id order by created_at
  cargarMiPermiso();          // puede_escribir del usuario en este grupo
  marcarLeido(grupo.id);
  const canal = supabase.channel('grupo-'+grupo.id)
    .on('postgres_changes',
        { event:'INSERT', schema:'public', table:'chat_mensajes', filter:'grupo_id=eq.'+grupo.id },
        (p) => { agregar(p.new); if (p.new.user_id !== userId) marcarLeido(grupo.id); })
    .subscribe();
  return () => { grupoActivo.current = null; supabase.removeChannel(canal); };
}, [grupo.id]);

// enviar (texto/foto/audio):
async function mandar({ texto=null, tipo='texto', adjunto_url=null }) {
  const { data } = await supabase.from('chat_mensajes')
    .insert({ grupo_id:grupo.id, user_id:userId, texto, tipo, adjunto_url })
    .select().single();
  if (data) agregar(data);          // optimista; el realtime deduplica por id
  // disparar push a los demás (ver §6.2): fetch('/api/push', { grupo_id, autor, texto:preview, excludeUserId:userId })
}
```

- `agregar(m)` deduplica por `id`: `setMsgs(p => p.some(x=>x.id===m.id) ? p : [...p, m])`.
- Auto-scroll **instantáneo** al fondo cuando cambian los mensajes:
  `el.scrollTop = el.scrollHeight` (sin `smooth`, que se ve como un salto).
- **Burbujas estilo WhatsApp:** fondo claro (`#ECE5DD`), barra superior naranja, burbuja propia
  `#FFE7AE` a la derecha, ajena blanca a la izquierda con el nombre del autor.
- **Solo lectura:** si `puede_escribir` es false (y no es dueño), en vez de la caja de texto se
  muestra "🔒 Solo lectura".

**Foto (con vista previa tipo WhatsApp):**
```js
// 1) al elegir archivo: NO se manda, se muestra preview
setFotoPrev({ file, url: URL.createObjectURL(file) });
// 2) al tocar "Enviar":
const url = await subirFoto(file);           // Storage o /api/subir
await mandar({ tipo:'foto', adjunto_url:url });
```

**Audio (mensaje de voz):**
```js
const tipos = ['audio/mp4','audio/webm','audio/ogg'];          // iPhone: mp4; Android: webm
const mime = tipos.find(t => MediaRecorder.isTypeSupported(t)) || '';
const rec = new MediaRecorder(stream, mime ? { mimeType:mime } : undefined);
rec.ondataavailable = e => e.data.size && chunks.push(e.data);
rec.onstop = async () => {
  const tipoReal = rec.mimeType || mime || 'audio/webm';
  const ext = tipoReal.includes('mp4') ? 'm4a' : tipoReal.includes('ogg') ? 'ogg' : 'webm';
  const blob = new Blob(chunks, { type: tipoReal });
  const url = await subirAudio(blob, ext);   // Storage o /api/subir-init
  await mandar({ tipo:'audio', adjunto_url:url });
};
```
> ⚠️ El **iPhone no reproduce `webm`**. Por eso se elige el mimeType soportado por el dispositivo
> (graba mp4/m4a en iPhone). Los audios viejos en webm no suenan en iPhone.

Render del adjunto en la burbuja:
```jsx
m.tipo==='foto'  ? <a href={m.adjunto_url} target="_blank"><img src={m.adjunto_url}/></a> :
m.tipo==='audio' ? <audio controls src={m.adjunto_url}/> :
                   <span>{m.texto}</span>
```

### 4.3 Administración de miembros (solo dueño, botón ⚙)

Lista todos los empleados con checkbox **incluir** + **"habla"**. Al guardar:
`upsert` de los incluidos (`onConflict: 'grupo_id,user_id'`) y `delete` de los quitados.
El creador/uno mismo quedan siempre con `puede_escribir:true`.

### 4.4 Aviso flotante ("Fulano escribió en…")

Banner fijo arriba (z-index alto). Aparece cuando `aviso` no es null; se cierra solo a los 5 s
(`setTimeout`), y al tocarlo te lleva al grupo. Lee `aviso.autor`, `aviso.grupo`, `aviso.texto`.

---

## 5. Subida de fotos y audios — implementaciones

**Con Supabase Storage (churrería):**
```js
const nombre = `${grupoId}/${Date.now()}-${Math.round(Math.random()*1e6)}.${ext}`;
await supabase.storage.from('chat').upload(nombre, file, { contentType:file.type });
const { data } = supabase.storage.from('chat').getPublicUrl(nombre);
return data.publicUrl;
```

**Con endpoint propio (Fun Zone):**
```js
// foto: imagen base64 → /api/subir → { url }
async function subirFoto(dataUri){
  const r = await fetch('/api/subir', { method:'POST',
    headers:{'Content-Type':'application/json'}, body:JSON.stringify({ image:dataUri }) });
  const d = await r.json(); return d.url;
}
// audio: PUT prefirmado → /api/subir-init → { upload_url, file_url }
async function subirAudio(blob, ext){
  const r = await fetch('/api/subir-init', { method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ content_type:blob.type, ext }) });
  const d = await r.json();
  await fetch(d.upload_url, { method:'PUT', headers:{'Content-Type':blob.type}, body:blob });
  return d.file_url;
}
```

---

## 6. Notificaciones

### 6.1 En la app / segundo plano — Notification API (fácil, ya funciona)

```js
export async function pedirPermiso(){ return await Notification.requestPermission(); }
export function notificar(titulo, cuerpo){
  if (Notification.permission==='granted')
    try { new Notification(titulo, { body:cuerpo, icon:'/icon-192.png', tag:'chat' }); } catch(e){}
}
```
Se llama desde el handler global del §3. En iPhone, el `new Notification()` casi no funciona
en PWA standalone → para iPhone hace falta Web Push (6.2).

### 6.2 Push con la app CERRADA — Web Push (VAPID)

Piezas (todas implementadas y funcionando en la churrería):

**a) Claves VAPID** (una vez): `require('web-push').generateVAPIDKeys()` → `publicKey`/`privateKey`.
Guardar como variables de entorno del servidor: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
`VAPID_SUBJECT` (`mailto:...`), y la pública también para el cliente (`VITE_VAPID_PUBLIC_KEY`).

**b) Tabla de suscripciones:**
```sql
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid, endpoint text unique, p256dh text, auth text, created_at timestamptz default now()
);
```

**c) Cliente — suscribirse al dar permiso:**
```js
const reg = await navigator.serviceWorker.ready;
const sub = await reg.pushManager.subscribe({
  userVisibleOnly:true,
  applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) // helper estándar base64url→Uint8Array
});
const j = sub.toJSON();
await supabase.from('push_subscriptions').upsert(
  { user_id:userId, endpoint:sub.endpoint, p256dh:j.keys.p256dh, auth:j.keys.auth },
  { onConflict:'endpoint' });
```

**d) Endpoint que envía (serverless, Node):**
```js
import pg from 'pg'; import webpush from 'web-push';
webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
export default async function handler(req, res){
  const { grupo_id, autor, texto, excludeUserId } = req.body;
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
  const { rows } = await c.query(
    `select s.* from chat_miembros m join push_subscriptions s on s.user_id=m.user_id
     where m.grupo_id=$1 and m.user_id<>$2`, [grupo_id, excludeUserId]);
  const payload = JSON.stringify({ title:autor, body:texto, url:'/chat/'+grupo_id, tag:'chat-'+grupo_id });
  for (const r of rows) {
    try { await webpush.sendNotification({ endpoint:r.endpoint, keys:{ p256dh:r.p256dh, auth:r.auth } }, payload); }
    catch(e){ if (e.statusCode===404||e.statusCode===410) await c.query('delete from push_subscriptions where id=$1',[r.id]); }
  }
  res.json({ ok:true });
}
```
Se dispara desde `mandar()` (§4.2): `fetch('/api/push', { grupo_id, autor, texto, excludeUserId:userId })`.

**e) Service worker** (`/sw.js`) — recibe el push y lo muestra:
```js
self.addEventListener('push', e => {
  const d = e.data ? e.data.json() : {};
  e.waitUntil(self.registration.showNotification(d.title||'Chat',
    { body:d.body, icon:'/icon-192.png', data:{ url:d.url||'/chat' }, tag:d.tag }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data.url));
});
```
Registrar el SW en el arranque: `navigator.serviceWorker.register('/sw.js')`.

**f) iPhone:** requiere PWA **instalada** (Agregar a inicio), iOS **16.4+**, abrir desde el ícono,
y dar permiso. Verificado funcionando en iOS 18.

---

## 7. Permisos — "quién puede hablar"

- Columna `chat_miembros.puede_escribir` (default true).
- El dueño la setea al crear el grupo (checkbox "habla") o desde ⚙ (administrar miembros).
- El cliente oculta la caja de texto y muestra "🔒 Solo lectura" si es false.
- Con login de Supabase (Variante A) además lo **bloquea la base** en la policy de INSERT.

---

## 8. Decisiones y aprendizajes (para no tropezar igual)

1. **Suscripciones realtime que se acumulan** → nombre de canal único + deps mínimas + refs (§3).
2. **El "salto" de pantalla al enviar** → la conversación es un panel fijo y **solo scrollea la
   lista**; auto-scroll instantáneo (no `smooth`).
3. **Foto que se manda sola** → vista previa con botón "Enviar" antes de subir.
4. **Audio en iPhone** → elegir mimeType soportado (mp4 en iPhone), no fijar webm.
5. **Ícono PWA negro en iPhone** → es el ajuste de "apariencia de íconos" de iOS, no la app;
   igual conviene poner `<link rel="apple-touch-icon">`.
6. **Mostrar/ocultar contraseña** → un solo componente de input con ojito 👁️ sirve para todos.

---

## 9. Checklist de integración (para una app nueva)

- [ ] Correr el SQL (tablas + `alter publication ... add table chat_mensajes`).
- [ ] Decidir la variante de seguridad (A: con login Supabase + RLS, o B: sin login + RLS off).
- [ ] Definir `userId` = `auth.uid()` (A) o `sesion.id` (B).
- [ ] Montar el "cerebro" global (no leídos + aviso + 1 suscripción realtime). Nombre de canal único.
- [ ] Lista de grupos + crear grupo (dueño).
- [ ] Conversación: panel fijo, lista scrolleable, texto/foto/audio, solo lectura, ⚙ admin.
- [ ] Subida de adjuntos (Storage o endpoint propio).
- [ ] Notificación en la app (Notification API).
- [ ] (Opcional) Web Push: VAPID + tabla + suscripción + `/api/push` + service worker + PWA.
- [ ] Punto de entrada al chat (ítem de menú o botón en el header) con globo de no leídos.

---

### Archivos de referencia (código real, ya funcionando)

- Churrería (React/Vite, con login + push): `churreria-control/` →
  `src/context/ChatContext.jsx`, `src/pages/Chat.jsx`, `src/pages/ChatGrupo.jsx`,
  `src/components/layout/AvisoChat.jsx`, `src/lib/push.js`, `api/push.js`, `public/sw.js`,
  `supabase/migrations/0020_chat.sql`, `0021_chat_permisos.sql`, `0022_push.sql`.
- Fun Zone (single-file, sin login): `fichaje.html` (bloque CHAT al final) +
  `fichaje-chat-schema.sql`.
