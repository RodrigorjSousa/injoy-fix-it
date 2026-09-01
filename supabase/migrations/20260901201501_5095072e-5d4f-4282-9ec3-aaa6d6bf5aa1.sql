UPDATE public.preventive_logs
SET technician_name = 'Flavio',
    technician_user_id = '2d3e4c4e-5fef-41a6-af1e-d030f3e24e0f'
WHERE technician_name ILIKE '%cristiano%';

UPDATE public.chamados
SET responsavel_nome = 'Flavio',
    responsavel_id = 'dc1e7292-fce1-4dbb-89da-96dda77320ee'
WHERE responsavel_nome ILIKE '%cristiano%';

UPDATE public.ativos_ar
SET tecnico = 'Flavio',
    tecnico_id = 'dc1e7292-fce1-4dbb-89da-96dda77320ee'
WHERE tecnico ILIKE '%cristiano%';

UPDATE public.purchase_requests
SET requested_by = 'Flavio'
WHERE requested_by ILIKE '%cristiano%';

UPDATE public.profiles
SET nome = 'Inativo'
WHERE id = 'cb1824b5-2344-4255-9322-6d44f57a2de6';

DELETE FROM public.user_roles
WHERE user_id = 'cb1824b5-2344-4255-9322-6d44f57a2de6';