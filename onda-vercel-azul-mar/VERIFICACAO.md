# Verificacao da entrega | ONDA 2.0

## Executado nesta entrega

- `npm ci --offline` / instalacao sem dependencias de runtime.
- `npm run build`: sintaxe dos arquivos JavaScript e estrutura/configuracao Vercel.
- 37 testes Node: fluxos HTTP locais, protecao do admin, CSRF/Origin, sessao, logout,
  revogacao, estoque, precos calculados pelo servidor, uploads, validacao de produtos,
  configuracoes, modo WhatsApp e contratos do adaptador HTTP do Supabase.
- Oito telas renderizadas no Chromium em ambiente isolado: inicio, colecao, produto,
  sacola, sobre, contato, politicas e login administrativo.
- Ausencia de excecoes JavaScript nessas oito telas e verificacao de largura mobile.

## Escopo importante

Os testes da API usam um substituto de banco/Auth/Storage exclusivo de testes.
Os testes do adaptador validam requisicoes e respostas simuladas. Isso NAO comprova
uma conexao real ao Supabase nem a execucao real das funcoes SQL.

A navegacao direta do navegador ao localhost foi bloqueada pela politica deste
ambiente. A verificacao visual usou documento isolado e transporte de teste para
ler a API local. Fotos/fontes externas nao foram validadas. Portanto, nao houve
um teste integral do navegador acessando o dominio final com os headers da Vercel.

Nao foram executados nesta entrega:
- instalacao do SQL em um projeto Supabase real;
- upload real para o Storage, validacao real das politicas RLS e SQL RPC;
- deploy/build na infraestrutura real da Vercel;
- configuracao de dominio, cobranca, frete ou pagamentos;
- migracao de produtos de uma instalacao SQLite anterior.

## Validacao obrigatoria depois de configurar sua conta

Execute `setup/03-VERIFICAR.sql`. Teste o login, cadastre e publique uma peca real
com foto, confira a vitrine, edite o estoque, recarregue, saia do painel e tente
acessar a API administrativa sem login. Ela deve bloquear o acesso.

Faca um novo deploy do mesmo codigo. Confirme que produto e foto continuam visiveis.
Teste no celular, em janela anonima e com a configuracao de WhatsApp que voce usara.
O comando opcional `npm run check:cloud` verifica a conexao real somente depois
que as variaveis forem preenchidas.

Nao ha certificacao de seguranca nem garantia de funcionamento em uma conta ainda
nao configurada. Este documento diferencia codigo testado localmente de servicos
externos que precisam ser ativados pelo proprietario.
