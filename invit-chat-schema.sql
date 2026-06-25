-- ============================================================
--  CHAT interno del STAFF — App de Invitaciones (Fun Zone)
--  Correr UNA vez en el Supabase (mismo proyecto: tnubhbtihssubnfpwuvu).
--  SQL Editor → New query → pegar todo → Run.
--  Mismo criterio que el resto: RLS DESACTIVADO (acceso con clave pública).
--  El "usuario" es el admin logueado: la dueña = 'superadmin', las encargadas = su id ('ua-...').
--  Por eso user_id es TEXT (no uuid).
-- ============================================================

create table if not exists invit_chat_grupos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  foto_url text,
  creado_por text,
  created_at timestamptz default now()
);

create table if not exists invit_chat_miembros (
  grupo_id uuid references invit_chat_grupos(id) on delete cascade,
  user_id text,
  puede_escribir boolean default true,
  ultimo_leido_at timestamptz default now(),
  primary key (grupo_id, user_id)
);

create table if not exists invit_chat_mensajes (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid references invit_chat_grupos(id) on delete cascade,
  user_id text,
  texto text,
  tipo text default 'texto',          -- texto | foto | audio
  adjunto_url text,
  created_at timestamptz default now()
);
create index if not exists invit_chat_msg_grupo_idx on invit_chat_mensajes(grupo_id, created_at);
create index if not exists invit_chat_miembro_user_idx on invit_chat_miembros(user_id);

alter table invit_chat_grupos   disable row level security;
alter table invit_chat_miembros disable row level security;
alter table invit_chat_mensajes disable row level security;

-- TIEMPO REAL
do $$ begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname='supabase_realtime' and schemaname='public' and tablename='invit_chat_mensajes'
     ) then
    alter publication supabase_realtime add table invit_chat_mensajes;
  end if;
end $$;
