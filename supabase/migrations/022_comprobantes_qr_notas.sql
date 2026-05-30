-- Agregamos la columna para la cadena del código QR devuelta por Nubefact
ALTER TABLE public.comprobantes
ADD COLUMN IF NOT EXISTS nubefact_qr_cadena text;

-- Aseguramos que la restricción de validación de tipo de comprobantes permita notas de crédito
-- Primero removemos la restricción si existe
ALTER TABLE public.comprobantes
DROP CONSTRAINT IF EXISTS comprobantes_tipo_check;

-- Luego agregamos la restricción actualizada (nota de crédito = tipo 3 en Nubefact)
ALTER TABLE public.comprobantes
ADD CONSTRAINT comprobantes_tipo_check 
CHECK (tipo IN ('nota_venta', 'boleta', 'factura', 'nota_credito', 'nota_debito'));

-- Si tenemos un campo relacionado a anulaciones/notas
ALTER TABLE public.comprobantes
ADD COLUMN IF NOT EXISTS comprobante_referencia_id uuid REFERENCES public.comprobantes(id) ON DELETE SET NULL;

-- Actualizamos la vista/rpc si es necesario (generalmente generar_numero_comprobante ya soporta el nuevo tipo si no estaba hardcoded)
