-- ============================================================
--  🔒 CERRAR LA BASE — PASO FINAL (18/08/2026)
--  ------------------------------------------------------------
--  Qué hace: pone el candado (RLS) en las tablas `eventos` y `confs` para que
--  la CLAVE PÚBLICA (la que está en el navegador) NO pueda leer, escribir ni
--  borrar nada. Hoy cualquiera con esa clave puede ver los datos de los papás
--  y las claves de las encargadas, y hasta borrar todo. Esto lo cierra.
--
--  ¿Se rompe algo? NO:
--   · La app de invitaciones (papá/invitado/dueña) ya pasa TODO por el
--     "portero" (/api/db), que usa la llave SECRETA del servidor y NO se ve
--     afectado por este candado.
--   · La app de fichaje entra con usuario y contraseña (Supabase Auth): queda
--     como rol "autenticado", que SÍ puede leer (la regla de abajo lo permite).
--   · Lo único que queda afuera es el rol "anónimo" (la clave pública suelta),
--     que es justo el agujero.
--
--  Cómo correrlo:
--   Supabase → tu proyecto → SQL Editor → New query → pegar TODO → Run.
-- ============================================================

-- 1) Prender el candado
alter table eventos enable row level security;
alter table confs   enable row level security;

-- 2) Borrar cualquier regla vieja que dejaba leer a CUALQUIERA (de intentos anteriores)
drop policy if exists "lectura publica eventos" on eventos;
drop policy if exists "lectura publica confs"   on confs;

-- 3) Dejar leer SOLO al rol "autenticado" (dueña y fichaje, que entran con
--    usuario y contraseña). El rol "anónimo" (clave pública suelta) queda SIN
--    ninguna regla = SIN acceso. El "portero" usa la llave de servicio, que
--    ignora el candado, así que sigue funcionando igual.
create policy "leer autenticado eventos" on eventos for select to authenticated using (true);
create policy "leer autenticado confs"   on confs   for select to authenticated using (true);

--    (No se crea NINGUNA regla de escritura/borrado para anónimo ni autenticado:
--     escribir y borrar queda SOLO para el portero con la llave de servicio.)


-- ============================================================
--  ✅ CÓMO VERIFICAR (después de correrlo)
--  1. Abrir una invitación de un papá por su link → tiene que verse igual.
--  2. Entrar como dueña al panel de invitaciones → tiene que cargar todo.
--  3. Entrar al fichaje con usuario/clave → las encuestas tienen que verse.
--  (Claude puede confirmar desde afuera que la clave pública ya NO lee nada.)
-- ============================================================


-- ============================================================
--  ⏪ DESHACER (plan B) — si algo se rompiera, correr ESTO y vuelve como antes:
-- ============================================================
-- alter table eventos disable row level security;
-- alter table confs   disable row level security;
