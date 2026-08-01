-- 1) Make existing shared tasks belong to Botafogo
UPDATE public.preventive_tasks SET property = 'Botafogo' WHERE property IS NULL;

-- 2) Duplicate them for Ipanema, keeping a mapping to remap Ipanema logs
CREATE TEMP TABLE _map (old_id uuid, new_id uuid);

WITH ins AS (
  INSERT INTO public.preventive_tasks (task_name, category, frequency_days, active, property, discipline)
  SELECT task_name, category, frequency_days, active, 'Ipanema', discipline
  FROM public.preventive_tasks
  WHERE property = 'Botafogo'
  RETURNING id, task_name, category, discipline
)
INSERT INTO _map (old_id, new_id)
SELECT o.id, i.id
FROM ins i
JOIN public.preventive_tasks o
  ON o.property = 'Botafogo'
 AND o.task_name = i.task_name
 AND o.category = i.category
 AND coalesce(o.discipline,'') = coalesce(i.discipline,'');

UPDATE public.preventive_logs l
SET task_id = m.new_id
FROM _map m
WHERE l.task_id = m.old_id AND l.property = 'Ipanema';

DROP TABLE _map;