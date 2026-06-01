-- Migration: 023_ordenes_compra
-- Descripción: Agrega tablas para almacenar las órdenes de compra a proveedores (proformas).

CREATE TABLE IF NOT EXISTS public.ordenes_compra (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ferreteria_id UUID NOT NULL REFERENCES public.ferreterias(id) ON DELETE CASCADE,
    proveedor TEXT NOT NULL,
    numero_orden TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'enviado', 'entregado', 'cancelado')),
    costo_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    notas TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Políticas RLS
ALTER TABLE public.ordenes_compra ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ordenes de compra visibles por ferreteria" ON public.ordenes_compra FOR SELECT USING (ferreteria_id = mi_ferreteria_id());
CREATE POLICY "Ordenes de compra insertables por ferreteria" ON public.ordenes_compra FOR INSERT WITH CHECK (ferreteria_id = mi_ferreteria_id());
CREATE POLICY "Ordenes de compra actualizables por ferreteria" ON public.ordenes_compra FOR UPDATE USING (ferreteria_id = mi_ferreteria_id());
CREATE POLICY "Ordenes de compra eliminables por ferreteria" ON public.ordenes_compra FOR DELETE USING (ferreteria_id = mi_ferreteria_id());


CREATE TABLE IF NOT EXISTS public.items_orden_compra (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    orden_compra_id UUID NOT NULL REFERENCES public.ordenes_compra(id) ON DELETE CASCADE,
    producto_id UUID REFERENCES public.productos(id) ON DELETE SET NULL,
    nombre_producto TEXT NOT NULL,
    marca TEXT,
    unidad TEXT NOT NULL DEFAULT 'unidad',
    cantidad INT NOT NULL DEFAULT 1,
    precio_unitario NUMERIC(12,2) NOT NULL DEFAULT 0,
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Políticas RLS
ALTER TABLE public.items_orden_compra ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Items OC visibles por orden" ON public.items_orden_compra FOR SELECT
USING (orden_compra_id IN (
    SELECT id FROM public.ordenes_compra WHERE ferreteria_id = mi_ferreteria_id()
));

CREATE POLICY "Items OC insertables" ON public.items_orden_compra FOR INSERT
WITH CHECK (orden_compra_id IN (
    SELECT id FROM public.ordenes_compra WHERE ferreteria_id = mi_ferreteria_id()
));

CREATE POLICY "Items OC actualizables" ON public.items_orden_compra FOR UPDATE
USING (orden_compra_id IN (
    SELECT id FROM public.ordenes_compra WHERE ferreteria_id = mi_ferreteria_id()
));

CREATE POLICY "Items OC eliminables" ON public.items_orden_compra FOR DELETE
USING (orden_compra_id IN (
    SELECT id FROM public.ordenes_compra WHERE ferreteria_id = mi_ferreteria_id()
));

-- Triggers for updated_at
CREATE TRIGGER set_timestamp_ordenes_compra
BEFORE UPDATE ON public.ordenes_compra
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Sequence for order number (similar to cotizaciones)
CREATE SEQUENCE IF NOT EXISTS public.seq_ordenes_compra START 1;

CREATE OR REPLACE FUNCTION public.generar_numero_orden_compra()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    siguiente_valor integer;
BEGIN
    SELECT nextval('public.seq_ordenes_compra') INTO siguiente_valor;
    RETURN 'OC-' || LPAD(siguiente_valor::text, 6, '0');
END;
$$;
