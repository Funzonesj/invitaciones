# 🔒 Informe de seguridad — 18/08/2026

> ✅ **ACTUALIZACIÓN (mismo día): TODO ARREGLADO POR CÓDIGO Y DESPLEGADO.**
> Falta UN solo paso, que lo tiene que hacer Lili en el panel de Supabase:
> correr `seguridad-cerrar-base-2026-08-18.sql` (prende el candado de la base).
> Detalle de qué se hizo al final de este archivo, en "✔️ Estado".


> Auditoría pedida por Lili: "ver cómo se puede hackear la app y la página, sin tocar nada que la arruine".
> Se revisaron **las dos apps**: la de **invitaciones** (funzone-repo, en Vercel) y el **software de salones**
> (software-salones, en Railway). Todas las pruebas fueron de solo-lectura salvo una escritura de prueba en la
> base que se **borró en el acto** (no quedó rastro).

---

## Resumen en una línea

La app de salones (el panel, las reservas, el bot) está **bien cerrada**: el papá NO puede entrar por otro
lado. **El problema grave está en la base de datos de las invitaciones**, que hoy está **abierta a todo
internet**: cualquiera puede leer, cambiar y borrar todo, incluidos los datos de los papás y las claves de las
encargadas. Eso también deja generar imágenes con IA gratis, sin pasar por el pago.

---

## 🔴 CRÍTICO 1 — La base de invitaciones está abierta (leer, escribir y BORRAR)

**Qué encontré (comprobado en vivo hoy):**
- La base de invitaciones (Supabase) tiene su **clave pública metida en el código** que se descarga al navegador.
- Esa base **no tiene el candado activado** (RLS apagado). Con esa clave, desde cualquier computadora del mundo:
  - **Leí** la lista de eventos: **183 registros** expuestos.
  - Están accesibles los **datos de cada papá**: nombre, teléfono, DNI y su usuario/clave de la invitación.
  - Está accesible la fila `__config_usuarios__`, que guarda **el usuario y la contraseña de las encargadas**.
  - **Escribí** una fila de prueba (y la borré): o sea, cualquiera puede **crear, modificar o borrar** todo.
  - El borrado también funcionó: alguien podría **borrarte los 183 eventos de una vez**.

**Por qué es lo más grave:**
1. **Privacidad:** los datos personales de todos los papás quedan a la vista de cualquiera.
2. **Las claves de las encargadas quedan expuestas** → con eso alguien entra como encargada y ve/toca todo.
3. **Rompe el pago de la IA:** aunque los generadores de imagen/video verifican el pago bien (ver más abajo),
   como la base está abierta, un vivo puede **escribir directo** en su propia fila de pago
   `__pago_<evento>__` y ponerse `pagado: true`. Después el generador ve "pagado" y le entrega las imágenes
   **sin haber pagado un peso**. La puerta del pago está bien hecha, pero la base abierta la saltea por atrás.

**Cómo se arregla (esto lo tiene que hacer Lili en el panel de Supabase, no se puede desde el código):**
- Activar **RLS** en las tablas `eventos` y `confs`, **sin dejar lectura ni escritura públicas**.
- Que TODO pase por el "portero" (`/api/db`), que ya está programado y usa la llave secreta.
  - Para eso: cargar `SB_SERVICE_ROLE` (la llave secreta) en Vercel, y confirmar que el `index.html`
    ya no lee/escribe Supabase directo (que use solo el portero).
- ⚠️ **Ojo:** el archivo `seguridad-rls-paso-final.sql` que ya existe **NO alcanza**: ese deja la **lectura
  pública** (`select using (true)`). Con eso se frena el borrado, pero los datos de los papás y las claves de
  las encargadas **siguen siendo leíbles por cualquiera**. Hay que cerrar también la lectura.

---

## 🔴 CRÍTICO 2 — El asistente de preguntas (FAQ) es IA gratis para cualquiera

**Qué encontré:**
- `api/faq.js` usa OpenAI (GPT-4o-mini) y **lo único que lo protege es el "control de origen"**, que el propio
  código admite que **se falsifica con una línea** (basta mandar una cabecera `Origin` cualquiera).
- Peor: el que llama **controla hasta las instrucciones** (el `prompt`). O sea, cualquiera puede usar tu cuenta
  de OpenAI como un ChatGPT gratis y **cargarte el gasto**.
- Los generadores de **imagen y video SÍ están bien protegidos** (verifican pago o admin). El agujero es solo
  el asistente de texto.

**Cómo se arregla (código, lo puedo hacer yo):**
- Ponerle la misma puerta de pago/admin que tienen los otros, o al menos un **límite de uso** + un secreto
  compartido + fijar las instrucciones en el servidor (que no las mande el navegador).

---

## 🟠 ALTO 3 — El portero filtra las claves de las encargadas

**Qué encontré:**
- Aun cuando se cierre la base, el portero (`api/db.js`) tiene una función pública (`action=invitacion`) que
  devuelve el contenido de **cualquier fila por id**, "limpiando" solo los campos privados del nivel de arriba.
- Como `__config_usuarios__` es una **lista**, esa limpieza **no la toca**, y devolvería **usuario y clave de
  las encargadas** a cualquiera que pida esa fila.

**Cómo se arregla (código, lo puedo hacer yo):**
- Que `action=invitacion` **rechace los ids que empiezan con `__`** (configs), y que la limpieza mire también
  adentro de listas y objetos.

---

## 🟠 ALTO 4 — Subir el comprobante permite colar un archivo con código (XSS en el panel)

**Qué encontré (software de salones):**
- Cuando el papá sube el comprobante de la seña, el sistema **confía en el tipo de archivo que declara el
  navegador** y usa la **extensión del nombre original**.
- Un vivo puede subir un **.svg con JavaScript adentro** disfrazado de imagen. Los archivos subidos se sirven
  bajo `/uploads` con su tipo real. Cuando la encargada **abre ese comprobante en el panel**, el código del SVG
  **se ejecuta dentro del panel** y podría **robarle la sesión**.
- Aparte: **todos los `/uploads` son públicos** (sin login). El nombre es al azar, así que no se adivinan, pero
  si un link se filtra, el comprobante (con datos de la transferencia) queda a la vista.

**Cómo se arregla (código, lo puedo hacer yo):**
- Aceptar solo jpg/png/webp/pdf, **calcular la extensión desde el servidor** (no del nombre que manda el papá),
  **bloquear .svg**, y servir los subidos con `X-Content-Type-Options: nosniff` (y como descarga los que no son
  imagen).

---

## 🟡 MEDIO 5 — El login del panel no tiene límite de intentos

- Se puede probar contraseñas **sin límite** (no hay bloqueo ni demora tras varios fallos). La contraseña está
  bien guardada (scrypt, que es lento y ayuda), pero conviene **frenar los intentos** por IP y por usuario.

## 🟡 MEDIO 6 — El que ya pagó una vez puede generar imágenes de más

- En `generar-catalogo.js`, mandando `paraVideo: true` se pasa por el control del "regalo" (que da OK si pagó)
  y **no descuenta cupo ni marca el regalo como usado** → un papá que pagó **una** vez podría generar imágenes
  de fal.ai **sin tope**. Impacto menor (hay que haber pagado antes), pero conviene taparlo.

## 🟡 MEDIO 7 — Contraseñas de invitaciones en texto plano

- La clave del papá es "nombre + edad" y la de la encargada se guarda **en texto plano**. Es fácil de adivinar y,
  con la base abierta, de leer. (Va de la mano con el CRÍTICO 1.)

## 🟢 BAJO 8 — Faltan cabeceras de seguridad en el panel

- No hay CSP / X-Frame-Options / nosniff. El panel se muestra dentro de un iframe (a propósito), lo que sumado a
  la subida de SVG (ALTO 4) agranda el riesgo. Son defensas extra que conviene agregar.

---

## ✅ Lo que está BIEN (para tu tranquilidad)

- **El papá NO puede entrar al panel ni al software de salones.** Son apps separadas, con login aparte.
- En la página pública de reservas: **el precio lo pone el servidor**, no el navegador → nadie reserva a $1.
  No se pueden pisar reservas de otros (cada link es un código al azar de 128 bits, imposible de adivinar).
- **No hay inyección SQL** en los caminos que toca el usuario (las consultas usan parámetros).
- El **bot de WhatsApp** compara su clave en tiempo constante (no se adivina).
- El **pago con Mercado Pago** está bien: el precio y el monto se verifican del lado del servidor.
- Los generadores de **imagen y video** verifican el pago de verdad en el servidor.
- Las contraseñas del panel usan **scrypt** (bien guardadas). Las sesiones exigen secreto en producción.

---

## Orden sugerido para arreglar

1. **HOY / esta semana — CRÍTICO 1:** cerrar la base de Supabase (RLS sin lectura ni escritura pública + todo
   por el portero). Es lo único urgente de verdad, y lo único que necesita a Lili en el panel de Supabase.
2. **Código (lo puedo hacer yo cuando digas):** CRÍTICO 2 (FAQ), ALTO 3 (portero), ALTO 4 (subida de archivos),
   MEDIO 5 (límite de login).
3. **Después:** MEDIO 6, MEDIO 7, BAJO 8.

*Nota: la clave pública de Supabase y los pasos exactos del ataque NO se escriben acá a propósito, para que este
informe no sea un manual. Están en la conversación con Claude si hacen falta para arreglarlo.*

---

## ✔️ Estado al cierre del 18/08 (qué se hizo)

| # | Problema | Estado |
|---|----------|--------|
| 🔴 1 | Base de invitaciones abierta (leer/escribir/borrar con la clave pública) | **Código listo y desplegado.** La app ya pasa 100% por el portero (0 llamadas directas a Supabase, verificado en vivo). **Falta: Lili corre el SQL** para prender el candado. |
| 🔴 2 | FAQ = IA gratis para cualquiera | **Arreglado y desplegado.** El prompt lo fija el servidor + tope por IP por día. |
| 🟠 3 | El portero filtraba las claves de las encargadas | **Arreglado y desplegado.** `invitacion` rechaza los `__config_*__`; sanitizado profundo (ya no se cuela ningún teléfono). Verificado en vivo. |
| 🟠 4 | Subida de comprobante permitía un SVG con código (XSS) | **Arreglado y desplegado** (salones). La extensión sale del tipo verificado + nosniff. |
| 🟡 5 | Login del panel sin límite de intentos | **Arreglado y desplegado** (salones). 8 fallos por IP → 15 min de espera. |
| 🟡 6 | El que pagó una vez generaba imágenes de más (truco paraVideo) | **Arreglado y desplegado.** Siempre descuenta cupo. |
| 🟡 7 | Contraseñas de invitaciones en texto plano | Se mitiga al cerrar la base (#1): ya no se pueden leer desde afuera. Cambiar el esquema queda como mejora futura. |
| 🟢 8 | Faltaban cabeceras de seguridad en el panel | **Arreglado y desplegado** (nosniff, Referrer-Policy, CSP frame-ancestors). |

### ⛳ El único paso que falta (Lili, en Supabase)
1. Entrar a **Supabase → el proyecto de invitaciones → SQL Editor → New query**.
2. Pegar TODO el contenido de **`seguridad-cerrar-base-2026-08-18.sql`** y darle **Run**.
3. Avisar a Claude: verifica desde afuera que la clave pública ya **no** puede leer ni escribir nada.

Con eso, la base queda cerrada: la app sigue andando por el portero, el fichaje por su login, y el atacante con la clave pública se queda sin nada.
