# ONDA Azul do Mar | Publicar no GitHub + Vercel

Este e o pacote NOVO para a Vercel. Ele substitui o servidor com SQLite da versão anterior.
Mantem a loja azul, a logo de onda e o painel de cadastro de produtos.

**Não precisa programar nem instalar Node no computador para seguir estes passos.**
Você precisa de contas no GitHub, na Vercel e no Supabase. O banco e as fotos ficam no
Supabase; a Vercel executa o site e a API. O SQL já esta pronto para copiar e executar.

> Sem conectar o Supabase, o site abre somente a prévia ilustrativa. O painel de
> cadastro fica desativado. Não confunda uma prévia funcionando com a loja completa.

## 1. Extrair o ZIP e colocar os arquivos no GitHub

Crie um repositório, de preferencia privado, chamado `onda-loja`.
Extraia o ZIP no seu computador. No GitHub, abra **Add file > Upload files**.
Envie os ARQUIVOS EXTRAIDOS e as pastas, não o ZIP fechado.

Na primeira tela do repositório devem aparecer `package.json` e `vercel.json`,
no mesmo nível das pastas `api`, `lib`, `public` e `setup`.
Não deixe tudo dentro de uma segunda pasta `onda-vercel` no repositório.
Finalize em **Commit changes**.

Os arquivos entregues não contem chaves reais. Nunca envie um `.env` preenchido,
um banco SQLite antigo, senhas, documentos de clientes ou a pasta `node_modules`.

## 2. Criar e instalar o Supabase

No Supabase, crie um **novo projeto dedicado a esta loja** e guarde a senha do banco
em local seguro. A senha do banco NAO e a senha do painel da loja.

Abra **SQL Editor > New query**. No seu computador, abra o arquivo:

```text
setup/01-BANCO.sql
```

Copie o conteúdo inteiro, cole no SQL Editor e clique em **Run**.
Esse arquivo instala as tabelas, as permissões e o armazenamento das fotos.
Use o script completo; não execute somente um trecho.

## 3. Criar seu acesso ao painel

No Supabase, abra **Authentication > Users > Add user > Create new user**.
Informe SEU e-mail e uma senha forte. Marque **Auto Confirm User**.

Agora abra `setup/02-ADMIN.sql` no seu computador. Substitua somente:

```text
SEU_EMAIL_AQUI
```

pelo mesmo e-mail criado acima. Copie o arquivo inteiro para uma nova consulta
no SQL Editor e clique em **Run**.

Não coloque sua senha nesse SQL. Não e a conta do GitHub ou da Vercel que entra
no painel: e a conta que você acabou de criar em Authentication > Users.
Não ha senha padrão nem cadastro público de administradores.

Opcionalmente, execute `setup/03-VERIFICAR.sql`. Ele apenas confere a instalação:
as tabelas devem mostrar RLS ativado; o bucket `onda-products` deve existir;
a contagem de administradores deve ser pelo menos 1; as duas permissões finais
devem mostrar FALSE.

## 4. Importar o repositório na Vercel

Na Vercel, escolha **Add New > Project**, conecte o GitHub e importe `onda-loja`.
Confira estes campos antes de publicar:

| Campo | Valor |
|---|---|
| Framework Preset | Other |
| Root Directory | `./` (raiz do repositório) |
| Build Command | `npm run build` |
| Output Directory | `public` |
| Install Command | `npm ci` |
| Node.js | `22.x` |

O `vercel.json` já define os comandos e as rotas. Não selecione Next.js ou Vite.
Não use `npm start` como Build Command. O `npm start` e somente para testes locais.

Antes de clicar em Deploy, abra **Environment Variables** e cadastre:

| Nome exato | Valor que você deve copiar do SEU Supabase |
|---|---|
| `SUPABASE_URL` | Project URL, por exemplo `https://SEU-PROJETO.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable key, normalmente iniciada por `sb_publishable_` |
| `SUPABASE_SECRET_KEY` | Secret key, normalmente iniciada por `sb_secret_` |

A URL aparece no painel **Connect** do projeto. As chaves aparecem em
**Project Settings > API Keys**. Os nomes dos menus podem variar.
Todos os três valores devem pertencer ao MESMO projeto.
Não use a senha do banco, a senha do painel ou um token de gerenciamento do Supabase.
Não coloque barras extras nem `/rest/v1` depois da Project URL.

Cadastre pelo menos no ambiente **Production**. Marque **Preview** apenas quando
aceitar que os deploys de teste acessem o mesmo banco. Para testes independentes,
use outro projeto Supabase e outras variáveis no ambiente Preview.

**A Secret key e administrativa: somente na Vercel, nunca no GitHub ou no chat.**
Não acrescente `NEXT_PUBLIC_` ou `VITE_` aos nomes.

Em um projeto antigo, o código também aceita a chave `anon` no campo
`SUPABASE_PUBLISHABLE_KEY` e a chave `service_role` no campo `SUPABASE_SECRET_KEY`.
Prefira as chaves novas, quando disponíveis.

Clique em **Deploy**. A Vercel fornecera o endereço do site.
Se adicionar ou corrigir variáveis depois, abra **Deployments > Redeploy** para
que o novo deploy receba os valores atualizados.

## 5. Abrir o painel e colocar a primeira peça

Abra o endereço publicado e acrescente `/admin` ao final.
Entre com o e-mail e a senha criados no Supabase.

No painel, escolha **Produtos > Novo produto**. Preencha nome, categoria, preço,
tamanho, cor, estoque e fotos. Depois clique em **Publicar produto**.

As fotos aceitas são JPG, PNG e WebP, até **3 MB cada**, no maximo 12 por produto.
Use fotos reais das suas peças. O primeiro arquivo sera a foto principal.
Assim que houver uma peça real publicada, os exemplos ilustrativos deixam a vitrine.

Abra a loja em outra aba e confirme o produto. Atualize a página, saia e entre no
painel, e teste novamente. Uma nova publicação do código não deve apagar os dados
que foram salvos no Supabase.

## 6. Antes de divulgar para clientes

Revise nome, contatos, entrega e trocas em **Configurações**. O modo inicial e
**Catálogo em preparação**. Para receber solicitações, cadastre o WhatsApp completo
com país e DDD e selecione **Solicitações pelo WhatsApp**.

Não ha Pix/cartão, aprovação de pagamento ou cálculo automático de frete nesta
versão. O WhatsApp recebe uma solicitação, não uma venda confirmada. Após fechar
uma venda, atualize o estoque manualmente no painel.

Como e uma loja comercial, use um plano da Vercel permitido para uso comercial
(como o Pro). O Hobby e restrito a uso pessoal não comercial. Confira também os
limites e a política de backups do plano escolhido no Supabase.

## Se algo der errado

**So aparece a prévia / entrar esta desativado:** faltam variáveis no ambiente do
deploy. Confira as três e publique novamente.

**E-mail ou senha invalidos:** use a conta de Authentication > Users, não a conta
da Vercel. Confira senha e confirmação do e-mail.

**Conta sem acesso administrativo:** execute `setup/02-ADMIN.sql` com o e-mail exato.

**Banco ainda não instalado:** execute o arquivo `setup/01-BANCO.sql` inteiro.
Se a Data API estiver desativada no projeto, ative-a com o schema `public` exposto;
as tabelas continuam protegidas por RLS e por ausencia de permissões de escrita.

**404 no /admin ou na API:** confira a raiz do repositório, o `vercel.json` e a pasta
`api`. Não envie apenas a pasta `public`.

**Erro ao enviar foto:** use JPG/PNG/WebP abaixo de 3 MB e confira se o bucket
`onda-products` foi criado pelo SQL.

**Esqueceu a senha:** veja a secao Recuperação administrativa no README. Não existe
endpoint público para redefinir senhas ou promover usuários.

O arquivo `VERIFICACAO.md` registra os testes executados e as validações que ainda
dependem da sua conta real. Este pacote não pública nada automaticamente em seu nome.
