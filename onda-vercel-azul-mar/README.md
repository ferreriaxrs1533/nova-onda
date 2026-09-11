# ONDA | Azul do Mar | Vercel + Supabase

**Comece por `COMECE-AQUI.md`.** Ele explica a publicacao pelo navegador,
sem terminal. Este repositorio e uma adaptacao independente para Vercel,
nao uma atualizacao do projeto incompleto do Lovable.

## O que esta incluido

Vitrine responsiva azul, logo de onda, catalogo, busca/filtros, pagina de produto,
sacola validada pelo servidor, solicitacao por WhatsApp, paginas institucionais,
login administrativo, produtos, variacoes e estoque, categorias, configuracoes,
upload/reordenacao de fotos, rascunho/publicacao, duplicacao e arquivamento.

As imagens da previa sao ilustrativas. Os produtos demonstrativos ficam no codigo,
separados do banco real, e nunca podem ser comprados. Fotos reais devem ser enviadas
pelo proprietario. A loja se apresenta como revenda independente, nao como loja oficial.

## Arquitetura

```text
public/                   HTML, CSS azul, JavaScript e ilustracoes de fallback
api/index.js             Handler HTTP da Vercel; sem listen() ou disco local
lib/app.mjs               Rotas, validacoes, sessao, CSRF e regras de catalogo
lib/cloud.mjs             Adaptador HTTP de Auth, Data API e Storage do Supabase
lib/content.mjs           Configuracoes iniciais e produtos demonstrativos
lib/security.mjs          Tokens aleatorios, hashes e validacoes comuns
setup/01-BANCO.sql         Instalacao transacional do schema e bucket
setup/02-ADMIN.sql         Concessao manual de acesso ao usuario confirmado
setup/03-VERIFICAR.sql     Conferencia somente leitura
scripts/check.mjs         Build: verificacoes de sintaxe e estrutura
scripts/dev.mjs           Servidor de desenvolvimento local
scripts/check-cloud.mjs   Diagnostico real de conexao, somente leitura
tests/                    Testes automatizados locais com doubles de servicos
vercel.json               Publicacao, redirecionamentos internos e headers
.env.example              Nomes das variaveis; sem chaves reais
```

Node.js 22.x. Nao ha dependencias npm de runtime. A API usa `fetch` nativo para
os endpoints oficiais do Supabase. `package-lock.json` esta incluido.
Nao ha SQLite, pasta de uploads gravavel nem processos permanentes no backend publicado.

## Contrato do backend

| Metodo e rota | Funcao |
|---|---|
| GET `/api/health` | Disponibilidade do handler e presenca das variaveis; NAO testa banco |
| GET `/api/catalog` | Produtos publicados, categorias e configuracoes publicas |
| GET `/api/admin/session` | Estado da propria sessao |
| POST `/api/admin/login` | Verifica senha no Supabase Auth e papel administrativo |
| POST `/api/admin/logout` | Revoga sessao local |
| GET `/api/admin/diagnostics` | Testa banco/Storage; exige administrador |
| GET/POST `/api/admin/products` | Lista/cadastra produtos reais |
| GET/PUT/DELETE `/api/admin/products/:id` | Consulta/edita/exclui um produto |
| POST `/api/admin/products/:id/duplicate` | Copia como rascunho, SKUs novos e estoque zero |
| POST `/api/admin/products/:id/archive` | Remove da vitrine sem apagar o cadastro |
| POST `/api/admin/upload` | Valida e envia imagem para Storage |
| POST `/api/admin/categories` | Adiciona categoria |
| PUT `/api/admin/settings` | Salva configuracoes permitidas |
| POST `/api/bag/validate` | Recalcula precos/estoque e monta solicitacao de WhatsApp |

`/admin` entrega a interface. A protecao dos dados ocorre no backend e no banco,
nao por esconder o HTML. `/api/*` e reescrito para uma unica Vercel Function.

## Seguranca

Todas as tabelas `onda_*` possuem RLS. Nenhum usuario anonimo ou apenas autenticado
pode consulta-las diretamente. A chave administrativa e usada somente nas funcoes
server-side; operacoes administrativas exigem sessao valida, conta autorizada e CSRF.
As funcoes SQL usam SECURITY INVOKER e concedem EXECUTE somente a service_role.

O login verifica a senha no Supabase Auth. Os tokens do Supabase nao sao enviados
ao navegador. O site cria uma sessao opaca de 8 horas, com apenas o hash do token
no banco, cookie HttpOnly, SameSite=Strict e Secure em producao.
A conta e revalidada no Auth nas requisicoes administrativas. Mudancas de senha,
conta ou novos logins podem encerrar sessoes anteriores. Remover uma linha de
`onda_admins` revoga o papel e remove as sessoes associadas por chave estrangeira.
Nao existe cadastro publico de administradores, senha padrao ou credencial de teste
no aplicativo publicado. Dados de testes ficam exclusivamente em `tests/`.

As mutacoes exigem Origin igual ao host do proprio site. Nao configure CORS aberto.
Os limites de tentativas ficam no Postgres e sao compartilhados entre instancias
da Vercel, em vez de depender de memoria local. Publicacao de produto e variantes
usa uma unica funcao SQL transacional.

O bucket `onda-products` e PUBLICO para exibir fotos. Inclusive fotos de rascunhos
podem ser acessadas por quem conhece suas URLs. Nao envie documentos pessoais,
comprovantes ou outros arquivos confidenciais. Escrita e feita somente pelo servidor.
Tipos aceitos: JPG/PNG/WebP, ate 3 MiB, validados por MIME e assinatura inicial.
Esse tamanho mantem o JSON em base64 abaixo do limite de requisicao da Vercel.

As fotos nao sao apagadas automaticamente quando um produto e excluido, pois
copias podem reutilizar a mesma imagem. Revise arquivos sem uso no Storage antes
de apaga-los. Remover uma foto da galeria nao e o mesmo que apagar o arquivo do bucket.

Nao ha implementacao de TOTP/MFA no login desta versao. Contas com fatores de MFA
ativos sao bloqueadas ate uma integracao especifica. Isso nao impede o uso de MFA
na sua conta pessoal de acesso ao dashboard do Supabase/Vercel.

## Recuperacao administrativa

O painel nao inclui redefinicao de senha por e-mail. Nao depende de SMTP para o
primeiro acesso. Nao use links de recuperacao apontando para localhost em producao.

Pelo dashboard confiavel do Supabase, o proprietario pode criar outro usuario
confirmado com um e-mail diferente e senha nova. Execute `setup/02-ADMIN.sql` para
essa nova conta, teste o login e somente depois remova a permissao da conta antiga
em Table Editor > `onda_admins`. Isso preserva catalogo e imagens. Nao apague produtos
para recuperar uma conta. O Supabase tambem oferece APIs administrativas de gestao
de usuarios para uma futura integracao de recuperacao.

## Rodar localmente (opcional)

Instale Node.js 22.x. Copie `.env.example` para `.env` e informe as tres variaveis.
Alem disso, instale o schema e autorize seu usuario no Supabase, como no guia.

```bash
npm ci
npm run build
npm test
npm start
```

Abra `http://localhost:3000` e `http://localhost:3000/admin`.
Sem variaveis, somente a previa abre. Nao ha banco local alternativo nem escrita
simulada em localStorage. O localStorage guarda apenas a sacola.

Para conferir a conexao configurada, sem alterar dados:

```bash
npm run check:cloud
```

O build NAO precisa de chaves. Nao existe placeholder que aprove um login sem banco.
A execucao de `npm run build` verifica o codigo; ela nao valida uma conta Supabase real.

## Migracao da versao anterior

O antigo pacote Node + SQLite nao pode ser enviado sem mudancas para a Vercel.
Este repositorio substitui aquele backend por Supabase e Vercel Functions.

Nao ha importacao automatica de `data/onda.sqlite`, senhas ou fotos antigas. Guarde
um backup da instalacao anterior. Se ja cadastrou produtos, recadastre-os no painel
novo ou prepare uma migracao especifica antes de desativar a loja antiga. Nao envie
`data/`, `.env` ou bancos com dados de clientes para o GitHub.

## Limites funcionais e operacao

Nao integra pagamentos, frete automatico, emails transacionais, contas de clientes,
reserva de estoque ou registro de pedidos. WhatsApp gera somente solicitacoes e
nao baixa estoque. A baixa e manual apos a confirmacao fora do site.

O catalogo atual e carregado no navegador para filtros instantaneos. O adaptador
busca paginas no Supabase para nao perder produtos no limite padrao de linhas,
mas catalogos muito extensos exigirao paginacao tambem no frontend para respeitar
os limites de resposta e desempenho. O servidor falha explicitamente se a resposta
ultrapassar seu limite, em vez de descartar produtos silenciosamente.

Mantenha backup do Postgres e das fotos do Storage separadamente. Credenciais devem
ser rotacionadas quando necessario. Revise as politicas de entrega, trocas, privacidade,
dados comerciais e permissao de uso das fotografias antes de vender.

GitHub e Vercel nao armazenam as fotos enviadas pelo painel. Republicar o codigo
nao reinstala o SQL nem recria os usuarios: esses recursos permanecem no Supabase.

## Documentacao oficial consultada

- Vercel Node runtime: `https://vercel.com/docs/functions/runtimes/node-js`
- Vercel configuration: `https://vercel.com/docs/project-configuration/vercel-json`
- Vercel Git integration: `https://vercel.com/docs/git`
- Vercel request limits: `https://vercel.com/docs/functions/limitations`
- Vercel Hobby terms: `https://vercel.com/docs/plans/hobby`
- Supabase API keys: `https://supabase.com/docs/guides/getting-started/api-keys`
- Supabase Storage: `https://supabase.com/docs/guides/storage/uploads/standard-uploads`
- Supabase Auth API: `https://github.com/supabase/auth/blob/master/openapi.yaml`

Veja `VERIFICACAO.md` para o escopo exato dos testes.
