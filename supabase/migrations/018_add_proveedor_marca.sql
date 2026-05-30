-- Migración: Añadir columnas proveedor y marca a productos
alter table public.productos
add column proveedor text,
add column marca text;
