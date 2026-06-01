-- Migración: Añadir columnas proveedor y marca a productos
alter table public.productos
add column if not exists proveedor text,
add column if not exists marca text;
