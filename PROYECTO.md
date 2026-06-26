# 📦 Proyecto Fun Zone & Play Point — Guía maestra

> Documento para **retomar el proyecto desde cualquier lado** (otra compu, otra cuenta, otro programador o IA). Acá está QUÉ es cada cosa, DÓNDE vive y CÓMO se edita y publica. **No contiene contraseñas** (esas van en un gestor de contraseñas; ver la sección Cuentas).

---

## 1) Qué son las apps

| App | Para qué | Link | Quién la usa |
|-----|----------|------|--------------|
| **Salón / Invitaciones** | Crear y compartir invitaciones de cumpleaños | https://funzonepro.com | Dueña (admin), papás, invitados |
| **Control de Horarios (Fichaje)** | Fichaje, horarios y sueldos del personal | https://controlhorario.funzonepro.com | Dueña, encargadas, empleados |

Las dos son **una sola página web cada una** (un archivo HTML) hecha con React. Las dos comparten la **misma base de datos**.

---

## 2) Las 4 "patas" del proyecto (acceso = control total)

Para poder modificar y NO perder nada, hay que tener acceso a estas 4 cuentas:

1. **GitHub** — guarda TODO el código. Repo: `github.com/Funzonesj/invitaciones` (rama `main`). **Es el respaldo principal.**
2. **Vercel** — publica las apps (toma el código de GitHub y lo pone online). Proyecto: `invitaciones`. Acá también están las **claves secretas** (variables de entorno).
3. **Supabase** — guarda los **datos** (eventos, invitados, empleados, sueldos, fichajes). Proyecto de `lemmaservicios@gmail.com`.
4. **Hostinger** — el **dominio** `funzonepro.com` (DNS apuntando a Vercel).

> 🔐 Guardá usuario y contraseña de las 4 en un **gestor de contraseñas** (ej: el de Google, Bitwarden). Mientras tengas esto, el proyecto es 100% tuyo y editable desde cualquier compu.

---

## 3) Cómo se publica (deploy)

Es automático: **se sube el código a GitHub → Vercel lo publica solo** en 1-2 minutos.

```
# parado en la carpeta del proyecto:
git add -A
git commit -m "descripción del cambio"
git push
```

---

## 4) ⚠️ Cómo se EDITA (importante: pre-compilado)

Las apps están **pre-compiladas** para abrir rápido. Por eso hay 2 versiones de cada archivo:

- **EDITAR ESTOS (código fuente, legible):** `index.src.html` (salón) · `fichaje.src.html` (fichaje)
- **NO editar a mano (generados):** `index.html` · `fichaje.html` (los publica Vercel)

**Flujo para un cambio:**
1. Editar el `*.src.html`.
2. Generar la versión publicable: `node build.cjs` (compila los `.src.html` → `index.html`/`fichaje.html`).
3. `git add -A && git commit -m "..." && git push`.

> El `build.cjs` saca la herramienta pesada (Babel) y deja el código "ya traducido". Si se edita el `index.html` directo, se pisa en el próximo build.

---

## 5) Dónde están los datos (Supabase)

- **Salón:** tablas `eventos` y `confs` (eventos = cumpleaños/config; confs = confirmaciones de asistencia).
- **Fichaje:** tablas `fichaje_*` (sucursales, empleados, eventos, fichajes, config, chat, etc.).
- **Seguridad:** los datos sensibles (contraseñas, sueldos, huellas, datos de papás) están **cerrados con RLS**. Las apps acceden por un "portero" seguro: `api/db.js` (salón) y `api/fichaje.js` (fichaje), que usan una clave secreta guardada en Vercel (`SB_SERVICE_ROLE`). La clave pública del frontend solo ve lo permitido.

---

## 6) Claves secretas (en Vercel → Settings → Environment Variables)

Solo los **nombres** (los valores nunca van en el código):
- `SB_SERVICE_ROLE` — acceso seguro del portero a Supabase.
- Claves de IA (generación de imágenes/video y FAQ).
- `MP_ACCESS_TOKEN` — Mercado Pago (cobros).

> Si se cambia de cuenta de Vercel, hay que **volver a cargar estas variables** (sin ellas, los porteros y la IA no funcionan).

---

## 7) Carpeta de archivos (qué es cada uno)

- `index.src.html` / `index.html` — app del **salón** (fuente / publicada).
- `fichaje.src.html` / `fichaje.html` — app de **fichaje** (fuente / publicada).
- `build.cjs` — compilador (paso 4).
- `api/` — los "porteros" y funciones: `db.js`, `fichaje.js`, `mp.js` (Mercado Pago), generación de imágenes/video, etc.
- `manifest-*.json` + `icon-*.png` — para instalar las apps como ícono en el celular.
- `vercel.json` — manda `controlhorario.funzonepro.com` a la app de fichaje.

---

## 8) Pendientes conocidos

- 💬 Cerrar con seguridad el **chat** de fichaje (tablas `fichaje_chat_*`, usan tiempo real).
- 💳 Mercado Pago: cargar las **credenciales de producción** cuando MP las habilite.

---

## 9) Cómo retomar desde CERO en otra compu / cuenta

1. Iniciar sesión en **GitHub** y abrir `github.com/Funzonesj/invitaciones`.
2. Descargar el código (botón verde **Code → Download ZIP**) o clonarlo con git.
3. Editar los `*.src.html`, correr `node build.cjs`, y `git push` (necesitás Node instalado).
4. Vercel publica solo. Si es una cuenta nueva de Vercel: conectar el repo de GitHub + cargar las variables de entorno (sección 6) + reconectar el dominio en Hostinger.

> Para editar con ayuda de una IA (como acá), simplemente abrila apuntando a esta carpeta/repositorio y pedile los cambios. Este documento le da todo el contexto.
