ALTER TABLE public.preventive_tasks REPLICA IDENTITY FULL;
ALTER TABLE public.preventive_logs REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'preventive_tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.preventive_tasks;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'preventive_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.preventive_logs;
  END IF;
END $$;