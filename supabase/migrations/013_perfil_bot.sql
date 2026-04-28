-- Fase 3: perfil_bot — personalización del bot por tenant
-- Almacena tipo_negocio, descripcion_negocio, tono_bot, nombre_bot.
-- DEFAULT '{}' → los tenants existentes no se ven afectados (defaults genéricos en código).

ALTER TABLE configuracion_bot
  ADD COLUMN IF NOT EXISTS perfil_bot JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN configuracion_bot.perfil_bot IS
  'Perfil genérico del bot: tipo_negocio, descripcion_negocio, tono_bot, nombre_bot. Permite usar el sistema para cualquier MYPE, no solo ferreterías.';
