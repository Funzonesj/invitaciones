# Chat interno (tipo WhatsApp) — Fun Zone / Play Point

Guía completa para dejar andando el chat en la app de fichaje (`fichaje.html`),
que vive dentro del repo **Funzonesj/invitaciones** y se sirve en
`https://invitaciones-flame-ten.vercel.app/fichaje.html`.

El chat ya está **escrito dentro de `fichaje.html`**. Para que funcione faltan
solo 2 cosas: **crear las tablas en Supabase** y **publicar el cambio**.

---

## Cómo está pensado (resumen técnico)

- **Mismo stack que la app de fichaje:** React + Babel en un solo HTML, Supabase por CDN.
- **Sin login de Supabase:** el "usuario actual" es el empleado logueado (`sesion`, que es
  una fila de `fichaje_empleados`). El chat usa `sesion.id` como identidad.
- **RLS desactivado** en las tablas del chat (igual que el resto de las tablas `fichaje_`).
  La seguridad es del lado del cliente; se endurece más adelante junto con el resto
  (ver `INFORME-SEGURIDAD.md`).
- **Tiempo real** con Supabase Realtime (suscripción a `fichaje_chat_mensajes`).
- **Fotos** se suben con el endpoint que ya existe `/api/subir` (imagen → URL).
- **Audios** se suben con `/api/subir-init` (PUT prefirmado, igual que los PDF).

---

## PASO 1 — Crear las tablas en Supabase (1 minuto)

1. Entrá al **Supabase de Fun Zone** (proyecto `tnubhbtihssubnfpwuvu`).
2. Menú izquierdo → **SQL Editor** → **New query**.
3. Abrí el archivo **`fichaje-chat-schema.sql`** (está en este mismo repo), copiá TODO y pegalo.
4. Apretá **Run**.

Eso crea 3 tablas y activa el tiempo real:

| Tabla | Para qué |
|---|---|
| `fichaje_chat_grupos` | Los grupos (los crea la dueña). |
| `fichaje_chat_miembros` | Quién está en cada grupo + si puede hablar + último leído. |
| `fichaje_chat_mensajes` | Los mensajes (texto / foto / audio). |

> El SQL también hace `alter publication supabase_realtime add table fichaje_chat_mensajes;`
> que es lo que hace que los mensajes lleguen al instante. Si esa línea diera error porque
> ya estaba agregada, no pasa nada.

---

## PASO 2 — Qué se agregó en `fichaje.html` (para verificar/entender)

Todo el código del chat ya está en el archivo. Estas son las piezas (por si querés revisarlas):

1. **Bloque de componentes del chat** (al final, antes de `ReactDOM.createRoot`):
   - `ChatVista` → lista de grupos + crear grupo (la dueña).
   - `ChatConversacion` → la conversación (burbujas, enviar texto/foto/audio, permisos).
   - `AdminMiembros` → la dueña administra quién está y quién puede hablar (botón ⚙).
   - `AvisoChat` → el cartelito flotante "Fulano escribió en…".
   - Helpers: `fzSubirAudio`, `fzNombreEmp`, `fzHora`, `fzPreview`, `fileADataURL`,
     y `fzChatActivo` (marca qué grupo está abierto).

2. **En `App`:**
   - Estado `chatNL` (no leídos) y `chatAviso`.
   - Un `useEffect` que carga los no leídos y se suscribe en tiempo real a los mensajes
     nuevos (para el globo y el aviso, aunque no estés en la pantalla de chat).
   - La función `marcarLeido`.
   - La ruta nueva: `{vista==='chat' && <ChatVista .../>}`.
   - Se renderiza `<AvisoChat .../>`.

3. **En `Header`:** botón **💬** (con globo de no leídos) que abre el chat. Está siempre
   visible, así no hubo que sacar nada del menú de abajo.

> Si en el futuro lo querés llevar a OTRA app, copiá esas piezas y cambiá:
> el nombre de las tablas, y de dónde sale el "usuario actual" (acá es `sesion.id`).

---

## PASO 3 — Publicar el cambio (deploy)

Fun Zone se publica desde GitHub (repo **Funzonesj/invitaciones**) → Vercel lo sube solo.
Hay dos formas:

**Opción A — desde la terminal (lo más simple):**
```
cd "C:\Users\lilia\OneDrive\Documentos\funzone-repo"
git add fichaje.html fichaje-chat-schema.sql CHAT-IMPLEMENTACION.md
git commit -m "Chat interno (grupos, tiempo real, fotos, audios, permisos)"
git push
```
Vercel detecta el push y publica en 1-2 minutos.

**Opción B — pedirle a Claude que lo suba** (cuando quieras, te lo dejo arriba yo).

> Importante: el deploy **solo cambia `fichaje.html`**; la app de invitaciones
> (`index.html`) NO se toca, queda igual.

---

## Cómo se usa (una vez publicado)

1. La **dueña** (o quien tenga rol `dueno`) entra y toca **💬** arriba → **"+ Grupo"**.
2. Le pone nombre, **tilda los empleados** que participan, y opcionalmente **destilda "habla"**
   para dejar a alguien en **solo lectura**.
3. Adentro del grupo: escribir, mandar **📷 foto** (con vista previa + "Enviar") y **🎤 audio**.
4. El botón ⚙ (solo dueña) administra los miembros después.
5. Cuando alguien escribe, a los demás les aparece el **globo de no leídos** y un **cartelito**.

---

## Almacenamiento de fotos y audios

No usa Supabase Storage: reutiliza los endpoints que ya tiene la app:
- **Fotos:** `subirFoto(dataUri)` → POST `/api/subir` → devuelve la URL.
- **Audios:** `fzSubirAudio(blob)` → POST `/api/subir-init` (pide un PUT prefirmado) → sube el audio → devuelve la URL.

Si esos endpoints cambian, el chat sigue la misma convención que el resto de la app.

---

## Notificaciones

- **Hoy (ya funciona):** con la app **abierta** o en segundo plano → globo de no leídos,
  cartelito flotante, y notificación del sistema si el usuario dio permiso.
- **Pendiente (push con app cerrada):** como en la churrería, necesita **Web Push**:
  claves VAPID, una tabla `fichaje_push_subscriptions`, suscribir el dispositivo al dar
  permiso, y un endpoint `/api/push` (Fun Zone ya tiene backend, así que se puede sumar).
  En iPhone requiere instalar la PWA y iOS 16.4+.

---

## Seguridad (nota)

Las tablas del chat quedan con **RLS desactivado**, igual que el resto de `fichaje_`
(la app accede con la clave pública). Cualquiera con la clave pública podría, técnicamente,
leer/escribir mensajes. Esto se endurece junto con el resto de la app **antes de usarlo
para algo sensible** (ver `INFORME-SEGURIDAD.md` y `PENDIENTE-SEGURIDAD.md`).

---

## Si algo no anda

- **No aparecen grupos / da error al crear:** ¿corriste el SQL del Paso 1?
- **Los mensajes no llegan solos:** revisá que el SQL haya agregado `fichaje_chat_mensajes`
  a la publicación `supabase_realtime` (Paso 1).
- **No suben fotos/audios:** esos usan `/api/subir` y `/api/subir-init`; tienen que estar
  desplegados (lo están en el proyecto invitaciones).
- **El botón 💬 no aparece:** asegurate de estar en la versión publicada nueva (deploy del Paso 3).
