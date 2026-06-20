-- ============================================================
--  APP DE FICHAJE Y HORARIOS — Fun Zone + Play Point
--  Correr UNA vez en Supabase (SQL Editor → New query → Run).
--  Misma instancia que la app del salón. Tablas con prefijo fichaje_.
--  NOTA: RLS queda DESACTIVADO (la app accede con la clave pública,
--  igual que el salón). Endurecer junto al resto de la seguridad
--  ANTES de cargar sueldos reales (ver INFORME-SEGURIDAD.md).
-- ============================================================

-- SUCURSALES
create table if not exists fichaje_sucursales (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  direccion text,
  lat double precision,
  lng double precision,
  radio_metros integer default 80,
  activa boolean default true,
  created_at timestamptz default now()
);

-- EMPLEADOS
create table if not exists fichaje_empleados (
  id uuid primary key default gen_random_uuid(),
  legajo integer,
  nombre text not null,
  rol_habitual text,                       -- Cocinero / Mozo / Auxiliar
  valor_hora numeric default 0,            -- $ ARS por hora (solo dueña edita)
  sucursales jsonb default '[]'::jsonb,    -- array de sucursal_id (puede trabajar en varias)
  foto_url text,
  facial_descriptor jsonb,                 -- descriptor face-api (128 nums) para reconocer la cara
  usuario text,
  clave text,                              -- v1 simple; hardening pendiente
  rol_sistema text default 'empleado' check (rol_sistema in ('dueno','encargada','empleado')),
  sucursal_encargada uuid,                 -- si es encargada, de qué sucursal
  activo boolean default true,
  created_at timestamptz default now()
);

-- EVENTOS / HORARIOS CARGADOS
create table if not exists fichaje_eventos (
  id uuid primary key default gen_random_uuid(),
  sucursal_id uuid references fichaje_sucursales(id),
  fecha date not null,
  paquete text,
  hora_inicio text,                        -- "16:30"
  hora_fin text,                           -- "19:30"
  orden_dia integer default 1,             -- 1 = primer evento del día, 2 = segundo...
  cliente text,
  festejado text,
  adicionales text,
  origen text default 'manual',            -- 'manual' | 'pdf'
  creado_por uuid,
  modificado_por uuid,
  modificado_at timestamptz,
  created_at timestamptz default now()
);

-- EMPLEADOS ASIGNADOS A CADA EVENTO
create table if not exists fichaje_evento_empleados (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid references fichaje_eventos(id) on delete cascade,
  empleado_id uuid references fichaje_empleados(id),
  legajo integer,                          -- por si todavía no está mapeado a un empleado
  rol_en_evento text,
  hora_ingreso_esperada text,              -- calculada por la regla (1.5h / 30min)
  fue_reemplazo boolean default false,
  reemplazado_a uuid,
  created_at timestamptz default now()
);

-- FICHAJES (entrada / salida)
create table if not exists fichaje_fichajes (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid references fichaje_empleados(id),
  sucursal_id uuid references fichaje_sucursales(id),
  evento_id uuid references fichaje_eventos(id),
  tipo text check (tipo in ('entrada','salida')),
  ts timestamptz default now(),
  lat double precision,
  lng double precision,
  foto_url text,
  facial_ok boolean,
  estado text,                             -- 'en_hora' | 'tarde' | 'sin_salida' ...
  created_at timestamptz default now()
);

-- ALERTAS
create table if not exists fichaje_alertas (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid,
  sucursal_id uuid,
  evento_id uuid,
  tipo text,                               -- 'tarde' | 'ausente' | 'sin_salida'
  descripcion text,
  leida boolean default false,
  created_at timestamptz default now()
);

-- BONUSES (por encuesta "Excelente")
create table if not exists fichaje_bonuses (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid,
  empleado_id uuid,
  monto numeric,
  motivo text,
  fecha date,
  created_at timestamptz default now()
);

-- CONFIGURACION (clave/valor en JSON)
create table if not exists fichaje_config (
  id text primary key,
  data jsonb,
  updated_at timestamptz default now()
);

-- ============================================================
--  SEMILLA INICIAL
-- ============================================================
-- Dos sucursales (las coordenadas GPS las cargás parada en cada salón
-- con el botón "Usar mi ubicación actual").
insert into fichaje_sucursales (nombre, direccion, radio_metros, activa)
select 'Fun Zone', 'Abraham Tapia 538 Sur, San Juan', 80, true
where not exists (select 1 from fichaje_sucursales where nombre='Fun Zone');

insert into fichaje_sucursales (nombre, direccion, radio_metros, activa)
select 'Play Point', 'Av. Libertador 2420 Oeste, San Juan', 80, true
where not exists (select 1 from fichaje_sucursales where nombre='Play Point');

-- Usuaria dueña para el primer ingreso (CAMBIÁ la clave después en Empleados).
insert into fichaje_empleados (nombre, usuario, clave, rol_sistema, activo)
select 'Lili (Dueña)', 'lili', 'lili1234', 'dueno', true
where not exists (select 1 from fichaje_empleados where usuario='lili');

-- Config por defecto (bonus, margen de tardanza).
insert into fichaje_config (id, data)
select 'general', '{"bonus_excelente":7000,"margen_tarde_min":10,"prep_primer_evento_min":90,"prep_evento_nuevo_min":30}'::jsonb
where not exists (select 1 from fichaje_config where id='general');
