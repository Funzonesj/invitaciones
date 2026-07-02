-- Agrega el campo "nombre de pila" a los empleados de fichaje.
-- Correr UNA vez en Supabase → SQL Editor. Es seguro re-correrlo (IF NOT EXISTS).
ALTER TABLE fichaje_empleados ADD COLUMN IF NOT EXISTS nombre_pila text;
