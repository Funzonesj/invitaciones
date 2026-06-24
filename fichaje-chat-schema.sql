-- ============================================================
--  CHAT interno — Fun Zone + Play Point (tipo WhatsApp)
--  Correr UNA vez en el Supabase de Fun Zone (SQL Editor → New query → Run).
--  Mismo criterio que el resto: RLS DESACTIVADO (acceso con clave pública).
--  El "usuario actual" es el empleado logueado (fichaje_empleados.id).
-- ============================================================

-- GRUPOS (los crea la dueña)
create table if not exists fichaje_chat_grupos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  foto_url text,
  creado_por uuid,
  created_at timestamptz default now()
);

-- MIEMBROS de cada grupo (+ permiso de escritura + último leído)
create table if not exists fichaje_chat_miembros (
  grupo_id uuid references fichaje_chat_grupos(id) on delete cascade,
  empleado_id uuid references fichaje_empleados(id) on delete cascade,
  puede_escribir boolean default true,
  ultimo_leido_at timestamptz default now(),
  primary key (grupo_id, empleado_id)
);

-- MENSAJES (texto / foto / audio)
create table if not exists fichaje_chat_mensajes (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid references fichaje_chat_grupos(id) on delete cascade,
  empleado_id uuid,
  texto text,
  tipo text default 'texto',          -- texto | foto | audio
  adjunto_url text,
  created_at timestamptz default now()
);
create index if not exists fz_chat_msg_grupo_idx on fichaje_chat_mensajes(grupo_id, created_at);
create index if not exists fz_chat_miembro_emp_idx on fichaje_chat_miembros(empleado_id);

-- Sin candado RLS (igual que el resto de las tablas fichaje_)
alter table fichaje_chat_grupos   disable row level security;
alter table fichaje_chat_miembros disable row level security;
alter table fichaje_chat_mensajes disable row level security;

-- TIEMPO REAL: publicar la tabla de mensajes
do $$ begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname='supabase_realtime' and schemaname='public' and tablename='fichaje_chat_mensajes'
     ) then
    alter publication supabase_realtime add table fichaje_chat_mensajes;
  end if;
end $$;
