-- Card das camareiras: tipo e motivo do bloqueio vindos do Cloudbeds (getRoomBlocks), igual ao card da Recepção.
--   block_kind   = 'manutencao' | 'bloqueado' | null
--   block_reason = motivo escrito no Cloudbeds (ex.: "troca carpete escada // Rita")
-- Reaplica a parte de colunas da 0051_room_housekeeping_bloqueio_cloudbeds, que não chegou ao banco
-- (o Lovable aplicou a outra 0051). A sincronização (consolidar-dados) já grava essas colunas;
-- sem elas, gravava os quartos sem o motivo. Idempotente.

ALTER TABLE public.room_housekeeping ADD COLUMN IF NOT EXISTS block_kind text;
ALTER TABLE public.room_housekeeping ADD COLUMN IF NOT EXISTS block_reason text;
