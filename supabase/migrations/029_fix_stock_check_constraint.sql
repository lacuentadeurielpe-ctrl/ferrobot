ALTER TABLE productos DROP CONSTRAINT IF EXISTS productos_stock_check;
ALTER TABLE productos ADD CONSTRAINT productos_stock_check CHECK (stock >= 0 OR venta_sin_stock = true);
