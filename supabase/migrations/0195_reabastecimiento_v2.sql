-- Migración: Reabastecimiento v2 - Tablas para proveedores y órdenes de compra
-- FERRETERÍA AISLADA: ferreteria_id en cada tabla + RLS + índices.

-- 1. Tabla de Proveedores
CREATE TABLE proveedores (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ferreteria_id UUID NOT NULL REFERENCES ferreterias(id) ON DELETE CASCADE,
  nombre        TEXT NOT NULL,
  telefono      TEXT,
  contacto      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_proveedores_ferreteria ON proveedores (ferreteria_id);
ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_proveedores" ON proveedores
  USING (ferreteria_id = mi_ferreteria_id());

-- 2. Tabla de Órdenes de Compra (Proformas a proveedores)
CREATE TABLE ordenes_compra (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ferreteria_id     UUID NOT NULL REFERENCES ferreterias(id) ON DELETE CASCADE,
  proveedor_id      UUID REFERENCES proveedores(id) ON DELETE SET NULL,
  proveedor_nombre  TEXT NOT NULL,
  estado            TEXT NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente', 'recibido', 'cancelado')),
  total             NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ordenes_compra_ferreteria ON ordenes_compra (ferreteria_id);
CREATE INDEX idx_ordenes_compra_proveedor  ON ordenes_compra (proveedor_id);
CREATE INDEX idx_ordenes_compra_estado     ON ordenes_compra (ferreteria_id, estado);

ALTER TABLE ordenes_compra ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_ordenes_compra" ON ordenes_compra
  USING (ferreteria_id = mi_ferreteria_id());

-- 3. Tabla de Ítems de Órdenes de Compra
CREATE TABLE items_orden_compra (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_compra_id UUID NOT NULL REFERENCES ordenes_compra(id) ON DELETE CASCADE,
  producto_id     UUID REFERENCES productos(id) ON DELETE SET NULL,
  nombre          TEXT NOT NULL,
  marca           TEXT,
  cantidad        INTEGER NOT NULL DEFAULT 1 CHECK (cantidad >= 1),
  precio_compra   NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (precio_compra >= 0),
  unidad          TEXT NOT NULL DEFAULT 'unidad'
);

CREATE INDEX idx_items_oc_orden ON items_orden_compra (orden_compra_id);
CREATE INDEX idx_items_oc_producto ON items_orden_compra (producto_id);

ALTER TABLE items_orden_compra ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_items_orden_compra" ON items_orden_compra
  USING (
    orden_compra_id IN (
      SELECT id FROM ordenes_compra 
      WHERE ferreteria_id = mi_ferreteria_id()
    )
  );
