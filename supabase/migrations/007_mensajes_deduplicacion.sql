-- Atomic deduplication: UNIQUE on ycloud_message_id prevents race conditions
-- If two webhook calls arrive simultaneously, only one INSERT will succeed
CREATE UNIQUE INDEX IF NOT EXISTS idx_mensajes_ycloud_message_id
  ON mensajes(ycloud_message_id)
  WHERE ycloud_message_id IS NOT NULL;
