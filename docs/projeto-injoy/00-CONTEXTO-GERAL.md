# PROJETO INJOY — Contexto geral

> Leia este arquivo inteiro antes de qualquer trabalho. Depois leia o arquivo do assunto
> (01 a 05). Atualize a seção "Estado atual" do assunto ao terminar cada entrega.

## O negócio
- **IN.JOY Hostel Design Pousada** (INJOY HOTÉIS — injoyhoteis.com), Rio de Janeiro.
- Duas unidades: **Botafogo** (19 quartos, tem recepção) e **Ipanema** (12 quartos, sem recepção fixa).
- Dono do projeto: **Rodrigo** (gestor). Fala português; 20 anos em automação industrial.
- Equipe usa celulares da empresa. Papéis: gestor, admin, recepcao, camareira, funcionario.
- Mayara (recepção) alimenta a Bonificação. **Nunca usar senha de funcionário** para testar.

## O aplicativo
- Repositório: **https://github.com/RodrigorjSousa/injoy-fix-it** (branch `main`).
- Feito no **Lovable**. O Lovable sincroniza com o GitHub nos dois sentidos.
- Stack: TanStack Start/Router (rotas em `src/routes/_authenticated/*`, `routeTree.gen.ts` é gerado
  no build), React Query, Supabase JS, shadcn/ui, Tailwind, vitest, bun.
- Banco: **Lovable Cloud (Supabase) projeto `vpeuugeoetwvrmrtemgj`**. Nunca usar `uxteuvvtlgoipixnwubl`.
- Integrações: Cloudbeds (reservas, PDV, check-out, pagamentos), fechaduras Tuya, Pontomais
  (ponto oficial, legado), push notifications (`public/push-sw.js`).

### Peças importantes
| O quê | Onde |
|---|---|
| Usuário logado / papéis | `useMe()` em `src/lib/store.ts` |
| Proteção de rota | `src/lib/require-gestor.ts` (`requireGestor({somenteGestor})` ou `{tela}`) |
| Menu lateral | `src/components/app-shell.tsx` (`ALL_NAV`) |
| Telas liberáveis por funcionário | `src/lib/telas-catalog.ts` + `funcionarios.telas_permitidas` |
| Área do gestor | `src/routes/_authenticated/gestor/*` |
| Papel no banco | `private.has_role(uid, 'gestor')` (enum `public.app_role`) |
| Migrações | `drizzle/migrations/NNNN_nome.sql` |

## Como trabalhamos (fluxo que funciona)
Rodrigo prefere mudanças pelo GitHub para economizar créditos do Lovable.

1. Claude cria uma branch a partir de `origin/main`, faz a mudança e verifica:
   `npx tsc --noEmit -p .` · `npx vitest run` · `npx vite build`.
   Migrações SQL são testadas antes num Postgres local, com stubs de `auth.users`, `auth.uid()` e
   `private.has_role`, simulando cada usuário com `set role authenticated`.
2. **Envio pelo PC do Rodrigo** (o push direto da nuvem dá 403):
   - `git bundle create x.bundle origin/main..HEAD`, depois SendUserFile e `device_commit_files` para
     `C:\Users\ideapad\Documents\GitHub\injoy-fix-it\`.
   - No PC (Desktop Commander, PowerShell): `git fetch origin; git fetch .\x.bundle HEAD:<branch>;
     git push -u origin <branch>`; apagar o bundle.
3. Rodrigo faz o merge em `https://github.com/RodrigorjSousa/injoy-fix-it/pull/new/<branch>`.
   **Não fazer merge na main sem ele.**
4. Se houver migração, Rodrigo manda ao Lovable:
   *"Aplique a migração `drizzle/migrations/NNNN_x.sql` exatamente como está, sem alterar nem
   esvaziar o arquivo. Se der erro, me mostre a mensagem completa."*
5. **Lovable → Publicar → Atualizar.** Sem publicar, o app usado pela equipe continua antigo.

Commits terminam com:
```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

## Cuidados que já custaram tempo
- O Lovable **renumera ou esvazia migrações** (ex.: 0031 esvaziada depois de falhar). Quando falhar,
  crie um arquivo NOVO e idempotente (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP POLICY IF EXISTS`).
  Não edite `meta/_journal.json`.
- `public.profiles` **não tem coluna email**: use `auth.users.email`.
- O Lovable não cria bucket por migração (`storage.buckets`); bucket é criado pela ferramenta de
  storage dele, e as policies vão numa migração separada.
- A ferramenta de leitura SQL do Lovable não é um usuário logado: funções só com `GRANT authenticated`
  dão "permission denied" ali. Isso é esperado.
- plpgsql: `text[] || 'literal'` dá erro; use `array_append`.
- `.maybeSingle()` dá erro com 2 linhas: em `funcionarios` use `.order("nome").limit(1).maybeSingle()`.
- RLS em DELETE apaga 0 linhas sem erro: use `.select("id")` e confira se apagou.
- Permissões: uma única fonte no banco (RPC) usada pela rota, pelo menu e pela tela. Nada de
  regra pelo nome da pessoa.
- Nunca afirmar "vai funcionar" sem teste. Mostrar a mensagem de erro real na tela.

## Módulos já entregues (resumo)
- Área do gestor + Financeiro (0006–0009, 0017/0018).
- Escala (0010–0016) — ver `01-escalas.md`.
- Ponto facial (0019–0026) — ver `02-ponto.md`.
- Bonificação: lançamento conjunto Recepção + Camareiras, aba **Acessos** (tabela
  `bonificacao_acessos`, RPC `minha_permissao_bonificacao`), botões Editar e Excluir, e notas
  Geral/Funcionário/Limpeza na tela inicial com janela só de visualização (0003–0005, 0026–0032).
- Meta da equipe (0033): +R$ 100 por pessoa quando as 3 médias ficam em 9 ou mais. A pessoa perde
  as duas bonificações com mais de 3 atrasos (tolerância de 10 min contra a Escala) ou com falta
  sem justificativa.
  - Atrasos e faltas vêm do Pontomais (`registro_ponto_pontomais`) ou do ponto do app
    (`ponto_batidas`).
  - O gestor justifica em Bonificação › Meta equipe.
  - Atualização automática 3x/dia: cron chama `private.run_bonus_meta_sync`, que chama
    `/api/public/bonus-meta`.
  - Participantes: Raquel, Julia, Mayara, Gleidiane, Lucivaldo e Flavio.

## Conversas do PROJETO INJOY
Uma conversa por assunto. Cada uma começa lendo este arquivo e o arquivo do assunto:
1. Escalas — `01-escalas.md`
2. Marcação de ponto — `02-ponto.md`
3. Lavanderia — `03-lavanderia.md`
4. Totem (auto check-in, check-out e avaliação) — `04-totem.md`
5. Mercado autônomo no hall — `05-mercado-autonomo.md`

Pendências gerais: Fase 3 (licenças e vistorias obrigatórias: bombeiros, vigilância sanitária,
caixa d'água/cisternas, dedetização, extintores, Cadastur) ainda não começou; limpeza automática
das selfies antigas do ponto foi oferecida.
