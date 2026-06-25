-- ============================================================
--  SEGURIDAD — PASO FINAL (parte 1): proteger las ESCRITURAS
--  ------------------------------------------------------------
--  Qué hace: pone el candado para que NADIE pueda modificar,
--  borrar ni inyectar datos en tu base usando la clave pública.
--  (Hoy cualquiera podría borrarte TODOS los eventos.)
--  Las LECTURAS siguen funcionando igual que ahora.
--  La dueña/encargada/papá guardan a través del "portero" (/api/db),
--  que usa la llave secreta y NO se ve afectado por esto.
--
--  Cómo correrlo: Supabase → SQL Editor → New query → pegar TODO → Run.
-- ============================================================

alter table eventos enable row level security;
alter table confs   enable row level security;

-- Permitir LECTURA pública (la app sigue leyendo directo; por ahora no cambia nada)
drop policy if exists "lectura publica eventos" on eventos;
create policy "lectura publica eventos" on eventos for select using (true);

drop policy if exists "lectura publica confs" on confs;
create policy "lectura publica confs" on confs for select using (true);

-- (No se crean políticas de escritura para la clave pública -> escribir/borrar queda BLOQUEADO.)


-- ============================================================
--  DESHACER (plan B) — si algo se rompe, corré ESTO y vuelve como antes:
-- ============================================================
-- alter table eventos disable row level security;
-- alter table confs   disable row level security;
