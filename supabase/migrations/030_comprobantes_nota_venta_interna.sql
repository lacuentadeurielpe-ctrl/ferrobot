ALTER TABLE comprobantes DROP CONSTRAINT IF EXISTS comprobantes_tipo_check;
ALTER TABLE comprobantes ADD CONSTRAINT comprobantes_tipo_check CHECK (tipo IN ('nota_venta', 'nota_venta_interna', 'boleta', 'factura', 'nota_credito', 'nota_debito'));
