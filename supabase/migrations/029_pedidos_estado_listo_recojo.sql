-- Agregar el estado 'listo_para_recojo' a la restricción de estados permitidos de la tabla pedidos.
ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_estado_check;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_estado_check CHECK (estado IN ('programado', 'pendiente', 'confirmado', 'en_preparacion', 'listo_para_recojo', 'enviado', 'entregado', 'cancelado', 'devuelto'));
