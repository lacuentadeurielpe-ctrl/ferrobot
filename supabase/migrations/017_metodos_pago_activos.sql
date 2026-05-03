-- Columna metodos_pago_activos en ferreterias
-- Usada en: settings, pagos/matcher, bot/message-handler, ai/tools
ALTER TABLE ferreterias
  ADD COLUMN IF NOT EXISTS metodos_pago_activos text[]
  DEFAULT '{efectivo,yape,transferencia,tarjeta,credito}';
