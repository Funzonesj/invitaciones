# 🔒 PENDIENTE — Seguridad y privacidad (hacer MÁS ADELANTE)

> La dueña (Lili) pidió dejar esto anotado para resolverlo **después de terminar de configurar la app**.
> Cuando ella diga algo como **"hagamos lo de la seguridad pendiente"**, leer este archivo y retomar desde acá.

## Contexto de la app
- Frontend: un solo `index.html` (HTML + React por CDN). Toda la lógica está en el navegador → es copiable. (Se acepta por ahora.)
- Backend: funciones serverless en `/api` (Vercel).
- Base de datos: **Supabase** (tabla `eventos`, guarda eventos + configs en filas `__config_*__`).
- Archivos (fotos/videos/PDF): nube **fal** (se sube directo; la app guarda solo el link).
- Claves secretas (FAL_KEY, OPENAI, ELEVENLABS, MercadoPago): en variables de entorno de Vercel. ✅ OK.

## 🔴 PRIORIDAD 1 — Cerrar la base de datos (Supabase)
**Problema:** la clave "publishable" de Supabase está en el código (`SB_KEY` en index.html), a la vista.
Hoy CUALQUIERA puede leer/escribir la tabla `eventos` desde el navegador, incluyendo **datos personales de los papás (nombre, teléfono, DNI, optin de WhatsApp)**. Es un tema de PRIVACIDAD, no solo de copia.
(Comprobado: se pudo leer la base con esa clave durante el desarrollo.)

**Qué hacer (con Lili, guiándola en el panel de Supabase):**
1. Activar **Row Level Security (RLS)** en la tabla `eventos`.
2. Como la app HOY lee/escribe directo desde el navegador (`sbLoadAll`, `sbUpsertEvento`, `sbUpsertConfig`, `sbDeleteEvento`), hay que decidir:
   - **Opción A (más segura):** mover las lecturas/escrituras sensibles al **backend** (`/api`) usando la `service_role` key (en Vercel env). El navegador deja de tocar Supabase directo.
   - **Opción B (rápida, parcial):** políticas RLS que permitan solo lo mínimo (p. ej. lectura pública SOLO de la tarjeta del invitado por id, y todo lo demás bloqueado / solo backend).
3. Verificar que tras cerrar RLS la app siga funcionando (admin, papás, invitado).
4. Especial cuidado: los datos del papá (tel/DNI) NO deberían ser leíbles públicamente.

## 🟠 PRIORIDAD 2 — Revisar el login de admin
- Revisar que el ingreso de administrador/encargada use contraseñas robustas y no se puedan adivinar/bypassear desde el frontend.

## 🟡 PRIORIDAD 3 — Dificultar la copia del frontend (opcional)
- Minificar/ofuscar el `index.html` (no impide copiar, pero lo dificulta).
- Quitar comentarios y código no usado.

## 🟢 PRIORIDAD 4 — Marca y dominio
- Comprar/conectar un dominio propio a Vercel (saca el `vercel.app`).
- Registrar la marca (a futuro, si se vende la app).

---
*Creado como recordatorio. Borrar o tachar ítems a medida que se resuelvan.*
