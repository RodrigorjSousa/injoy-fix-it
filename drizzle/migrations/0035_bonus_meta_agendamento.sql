-- Atualização automática da Meta da equipe, 3x por dia (horário de Brasília 8h30, 14h30 e 23h30).
-- Busca as batidas do Pontomais do mês e recalcula atrasos/faltas (função criada na 0034).
SELECT cron.schedule('bonus-meta-sync-0830', '30 11 * * *', 'SELECT private.run_bonus_meta_sync()');
SELECT cron.schedule('bonus-meta-sync-1430', '30 17 * * *', 'SELECT private.run_bonus_meta_sync()');
SELECT cron.schedule('bonus-meta-sync-2330', '30 2 * * *', 'SELECT private.run_bonus_meta_sync()');
