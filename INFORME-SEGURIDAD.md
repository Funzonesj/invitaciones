# 🔒 Informe de auditoría de seguridad — App de salón (Supabase + Vercel)

> Fecha: 2026-06-20 · Revisión basada en el código real (`index.html` + `/api/*`), no en suposiciones.
> Complementa a [PENDIENTE-SEGURIDAD.md](PENDIENTE-SEGURIDAD.md).

## ⚖️ Estado general

**🔴 La aplicación HOY no es segura.** Funciona perfecto, pero la protección de quién-ve-qué está **solo en el navegador**, y la **base de datos de Supabase está abierta**: cualquiera con la clave pública (que está a la vista en el código) puede **leer, modificar y borrar** todos los datos — incluidos **datos personales de los papás** (nombre, teléfono, DNI) y **contraseñas en texto plano**.

> Prueba concreta: durante el desarrollo se leyó y se modificó la tabla `eventos` desde afuera de la app, usando solo la clave pública, sin ninguna contraseña.

Lo bueno: **las claves secretas que cuestan plata (fal, OpenAI, etc.) NO están expuestas** — están bien guardadas en Vercel. El problema no son las claves secretas; es que la base está abierta y el control de acceso es solo visual.

---

## ✅/🔴 Respuesta punto por punto

| # | Lo que pediste verificar | Estado | Detalle |
|---|---|---|---|
| 1 | Páginas privadas requieren login | 🔴 No (solo visual) | El "candado" es estado de React (`vista`, `isAdmin`, `esSA`). No hay control real en el servidor. |
| 2 | Usuario sin login no accede por URL | 🔴 No | Aunque la pantalla no se vea, **los datos sí se pueden bajar** directo desde la API de Supabase con la clave pública. |
| 3 | Route Guards / Middleware | 🔴 No existen | No hay middleware ni verificación de sesión en el backend. Todo el ruteo es client-side. |
| 4 | RLS activado en las tablas | 🔴 No (o permisivo) | `eventos` y `confs` se leen/escriben desde el navegador sin token → RLS está apagado o deja pasar todo. |
| 5 | RLS impide ver datos de otros | 🔴 No | Cualquiera baja **todos** los eventos de **todos** los salones, con datos personales. |
| 6 | Service Role no expuesta en frontend | ✅ Correcto | No existe ninguna `service_role` en el código (verificado en todo el repo). |
| 7 | Solo clave ANON/pública en el cliente | ✅ Correcto | En el cliente solo está `sb_publishable_...` (la pública). Es lo correcto. |
| 8 | Variables sensibles en Vercel Env | ✅ Correcto | `OPENAI_API_KEY`, `FAL_KEY`, etc. se leen con `process.env` en `/api`. Ninguna está en el código. |
| 9 | Sin endpoints públicos con info sensible | 🔴 Falla | La propia API REST de Supabase devuelve **todo** (PII + contraseñas) a cualquiera con la clave pública. |
| 10 | Roles bien implementados | ⚠️ Parcial | **Dueña: bien** (login real con Supabase Auth, verificado en servidor). **Encargada y papá: mal** (contraseña en texto plano comparada en el navegador). |
| 11 | Usuario común no llega a funciones de admin | 🔴 No | Como la base está abierta y el control es visual, se puede escribir config de admin directo a la base, sin ser admin. |
| 12 | Sin vulnerabilidades evidentes | 🔴 Hay varias | Ver tabla de riesgos. (No se encontró XSS grave ni `eval`; sí base abierta, PII y contraseñas en texto plano, y endpoints pagos sin protección.) |

---

## 🚨 Riesgos encontrados (ordenados por gravedad)

### 🔴 1. Base de datos abierta (CRÍTICO)
- **Qué pasa:** con la clave pública (visible en `index.html`, líneas 54-55) cualquiera lee/escribe/borra las tablas `eventos` y `confs`.
- **Impacto:** filtración de datos personales de los papás, posibilidad de que alguien borre o altere eventos, encuestas y configuración.
- **Cómo se corrige:**
  1. Activar **RLS** en `eventos` y `confs` (en el panel de Supabase) con política **deny-all** (bloquear todo por defecto).
  2. Mover las lecturas/escrituras a funciones de backend (`/api`) que usen la clave **`service_role`** (guardada en Vercel, nunca en el navegador). El navegador deja de tocar Supabase directo.
  3. Excepción controlada para el invitado: una función `/api/invitacion?id=...` que devuelva **solo** lo necesario para mostrar la tarjeta (sin teléfono, sin DNI, sin contraseñas).

### 🔴 2. Contraseñas en texto plano (CRÍTICO)
- **Qué pasa:** las claves de **encargadas** (`__config_usuarios__`) y de **papás** (`ev.pass`) se guardan tal cual (sin cifrar) en la base abierta, y se comparan en el navegador.
- **Impacto:** quien lea la base ve todos los usuarios y contraseñas.
- **Cómo se corrige:** que TODOS entren con **Supabase Auth** (como ya hace la dueña), o como mínimo guardar las contraseñas **hasheadas** y validar el login en el backend. Nunca guardar ni comparar contraseñas en el navegador.

### 🟠 3. Endpoints pagos sin protección (ALTO — riesgo de costos)
- **Qué pasa:** `/api/generar-imagen`, `/api/generar-video`, `/api/lipsync`, `/api/voz`, `/api/faq`, etc. tienen `Allow-Origin: *` y **ninguna autenticación**. Cualquiera en internet puede llamarlos.
- **Impacto:** un tercero puede **gastar tu crédito** de fal/OpenAI llamando a esos endpoints en masa.
- **Cómo se corrige:** exigir sesión válida (token de Supabase Auth verificado en el backend) y/o un secreto compartido, limitar el origen (CORS a tu dominio), y agregar límite de uso (rate limiting).

### 🟠 4. Control de acceso solo en el navegador (ALTO)
- **Qué pasa:** roles, paneles y "páginas privadas" se deciden con estado de React. Quien sepa, lo edita desde el navegador.
- **Cómo se corrige:** el backend debe verificar el rol en CADA operación sensible (no confiar en el frontend). Se resuelve junto con los puntos 1 y 2.

### 🟡 5. Frontend copiable (BAJO / aceptado)
- Toda la lógica está en `index.html` → es copiable. Ya estaba asumido. Mitigable minificando/ofuscando, pero no es lo urgente.

### 🟡 6. `window.document.write()` en ventanas de impresión (BAJO)
- Se arma HTML con datos de la app para imprimir listas/tarjetas. Riesgo bajo (auto-inyección), pero conviene escapar los textos del usuario.

---

## ✅ Lo que está BIEN

- Las claves secretas (fal, OpenAI, ElevenLabs, MercadoPago) **no están en el código**: se leen de Vercel Env Vars. 👍
- En el cliente solo está la clave **pública** de Supabase (correcto), **no** la `service_role`. 👍
- El login de la **dueña** usa **Supabase Auth** (verificación real en el servidor). 👍
- No se detectó `eval`, ni `dangerouslySetInnerHTML`, ni XSS evidente.

---

## 🧭 Recomendación / plan sugerido

**Orden para resolver (de más urgente a menos):**

1. **Cerrar la base (RLS + backend).** Es la madre del problema; arregla los puntos 1, 2, 4, 5, 9 y 11 de tu lista.
2. **Sacar las contraseñas de texto plano** (todos por Supabase Auth, o hash + validación en backend).
3. **Proteger los endpoints pagos** (auth + CORS a tu dominio + rate limiting).
4. (Opcional) Ofuscar el frontend y conectar dominio propio.

**Importante:** cerrar la base es un **trabajo de fondo** (hay que mover las lecturas/escrituras al backend y que la app siga funcionando para dueña, encargada, papá e invitado). No es un retoque de un rato. Conviene hacerlo por etapas y probando cada parte.

---
*Generado como auditoría. Ir tachando ítems a medida que se resuelven.*
