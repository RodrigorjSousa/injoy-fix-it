
CREATE TABLE public.recados_gestor (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  gestor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  gestor_nome TEXT NOT NULL,
  unidade TEXT NOT NULL CHECK (unidade IN ('Botafogo','Ipanema')),
  setor TEXT NOT NULL CHECK (setor IN ('manutencao','recepcao','camareiras')),
  mensagem TEXT NOT NULL,
  midia_url TEXT,
  midia_tipo TEXT CHECK (midia_tipo IN ('foto','video'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recados_gestor TO authenticated;
GRANT ALL ON public.recados_gestor TO service_role;

ALTER TABLE public.recados_gestor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated pode ler recados do gestor"
ON public.recados_gestor FOR SELECT TO authenticated USING (true);

CREATE POLICY "Somente admin/gestor pode inserir recados"
ON public.recados_gestor FOR INSERT TO authenticated
WITH CHECK (
  private.has_role(auth.uid(),'admin'::public.app_role)
  OR private.has_role(auth.uid(),'gestor'::public.app_role)
);

CREATE POLICY "Somente admin/gestor pode atualizar recados"
ON public.recados_gestor FOR UPDATE TO authenticated
USING (
  private.has_role(auth.uid(),'admin'::public.app_role)
  OR private.has_role(auth.uid(),'gestor'::public.app_role)
)
WITH CHECK (
  private.has_role(auth.uid(),'admin'::public.app_role)
  OR private.has_role(auth.uid(),'gestor'::public.app_role)
);

CREATE POLICY "Somente admin/gestor pode remover recados"
ON public.recados_gestor FOR DELETE TO authenticated
USING (
  private.has_role(auth.uid(),'admin'::public.app_role)
  OR private.has_role(auth.uid(),'gestor'::public.app_role)
);

-- Storage policies for recados_midia bucket (bucket is created via tool separately)
CREATE POLICY "Recados midia: leitura autenticada"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'recados_midia');

CREATE POLICY "Recados midia: upload admin/gestor"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'recados_midia'
  AND (
    private.has_role(auth.uid(),'admin'::public.app_role)
    OR private.has_role(auth.uid(),'gestor'::public.app_role)
  )
);

CREATE POLICY "Recados midia: delete admin/gestor"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'recados_midia'
  AND (
    private.has_role(auth.uid(),'admin'::public.app_role)
    OR private.has_role(auth.uid(),'gestor'::public.app_role)
  )
);
