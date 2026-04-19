-- El constraint UNIQUE(pedido_id) era demasiado restrictivo:
-- un pedido puede tener una nota_venta Y una boleta (tipos distintos).
-- Cambiamos a UNIQUE(pedido_id, tipo) para permitirlo.

ALTER TABLE comprobantes
  DROP CONSTRAINT IF EXISTS comprobantes_pedido_id_key;

ALTER TABLE comprobantes
  ADD CONSTRAINT comprobantes_pedido_tipo_key UNIQUE (pedido_id, tipo);
