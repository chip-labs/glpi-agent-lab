# API do GLPI 11 (v2) — o que você precisa saber

Base: `http://localhost:8080/api.php`

Tudo abaixo foi confirmado ao vivo contra o lab local (GLPI 11.0.8), rodando
`docker compose up -d` na pasta `lab/`. Nada aqui é presumido.

## Antes de tudo: a API v2 vem desligada

Numa instalação nova, a "High-Level API" (a v2) está **desabilitada por
padrão**. Toda chamada em `/api.php/v2/...` retorna `403` com
`"detail":"The High-Level API is disabled"`, mesmo com um token válido, até
que as chaves `enable_api` e `enable_hlapi` sejam ligadas em
`glpi_configs` (contexto `core`) e o cache seja limpo
(`php bin/console cache:clear`). No lab, isso é feito por
`scripts/preparar-oauth.sh` — rode-o uma vez depois do `database:install`
(ver `lab/oauth-client.md`).

## Autenticação (OAuth2)

`POST /api.php/token` com JSON:

    {"grant_type":"password","client_id":"...","client_secret":"...",
     "username":"glpi","password":"glpi","scope":"api"}

Devolve `{token_type, expires_in: 3600, access_token, refresh_token}`. Todas
as demais chamadas levam o header `Authorization: Bearer <access_token>`.

As credenciais estão em `lab/oauth-client.md`. O token expira em 1 hora —
seu agente precisa renovar (mesmo endpoint, `grant_type: refresh_token`).

O swagger completo (schema OpenAPI) fica em `GET /api.php/v2/doc.json` — é
**público**: responde `200` com o schema inteiro (1219 rotas) sem nenhum
header `Authorization`, testado tanto de fora do container quanto de dentro
dele. Ainda assim precisa da API habilitada (ver seção acima).

## Armadilhas que custam horas

- **Paginação** é por `?start=N&limit=M` (não `?range=0-199` como em notas
  de outra instância — esse parâmetro é ignorado). Confirmado ao vivo: sem
  `start`/`limit`, ou com `limit` igual ou maior que o total de registros, a
  listagem retorna **HTTP 200** com o corpo completo. Com `start`/`limit`
  cobrindo só uma fatia de uma coleção maior (testado com 30 chamados
  descartáveis e `?start=0&limit=10`), a mesma rota retorna **HTTP 206
  Partial Content**. Ou seja: as notas de outra instância sobre "listagens
  retornam 206" só valem quando a resposta é de fato parcial — uma base
  vazia ou uma página que cobre tudo retorna 200. Em ambos os casos o header
  `Content-Range: <inicio>-<fim>/<total>` vem presente. **Trate qualquer
  código 200–299 como sucesso** — é a regra que cobre os dois casos e não
  quebra quando a base cresce.
- A API legada `/apirest.php` **não existe** nesta instalação (não há
  `apirest.php` nem `api.php` como arquivo físico em `public/`; tudo é
  roteado via `index.php`/Symfony). Não use.
- Tickets na lixeira têm `is_deleted: true` — confirmado no schema do
  `PATCH /Assistance/Ticket/{id}`, mas o filtro de listagem não foi testado
  ao vivo nesta task.

## Base de conhecimento

Rota confirmada ao vivo — **não é** `/Assistance/KnowbaseItem`,
`/Tools/KnowbaseItem` nem `/KnowBaseItem` como cogitado inicialmente:

- Lista: `GET /api.php/v2/Knowledgebase/Article`
- Detalhe: `GET /api.php/v2/Knowledgebase/Article/{id}`
- Criar: `POST /api.php/v2/Knowledgebase/Article`

Campos confirmados: `id`, `name` (título), `content` (conteúdo HTML — **não**
`answer`), `date_creation`, `date_mod`, `categories` (array), `entity`,
`is_faq`, `views`. O conteúdo é **HTML** — converta para texto antes de
indexar.

Confirmado ao vivo: `POST /api.php/v2/Knowledgebase/Article` com
`{"name": "...", "content": "<p>...</p>"}` retorna `201 Created` com
`{"id": ..., "href": "/Knowledgebase/Article/{id}"}`. A Task 7 pode escrever
os artigos da seed direto pela API.

## Categoria de chamado

Rota confirmada ao vivo — **não é** `/Assistance/ITILCategory` como cogitado
no brief original:

- Lista: `GET /api.php/v2/Dropdowns/ITILCategory`
- Detalhe: `GET /api.php/v2/Dropdowns/ITILCategory/{id}`

(A categoria de artigos da base de conhecimento é uma rota separada:
`GET /api.php/v2/Knowledgebase/Category`.)

## Usuário

Rota confirmada ao vivo — bate com a suposição do brief:

- Lista: `GET /api.php/v2/Administration/User`
- Detalhe: `GET /api.php/v2/Administration/User/{id}`
- Usuário autenticado: `GET /api.php/v2/Administration/User/Me`

## Chamados

- Lista: `GET /api.php/v2/Assistance/Ticket`
- Detalhe: `GET /api.php/v2/Assistance/Ticket/{id}` (mesmo shape da lista)
- Dropdowns já vêm expandidos inline: `status`, `category`, `entity` são
  objetos `{id, name}`, não IDs soltos (confirmado no `PATCH` de teste).

Campos confirmados: `id`, `name` (título), `content` (HTML), `status`,
`priority`, `urgency`, `impact`, `category`, `entity`, `user_recipient`,
`date_creation`, `date_mod`, `date_solve`, `date_close`. O campo `team[]`
citado em notas de outra instância **não foi observado** na resposta de
teste desta instalação — não documentamos o formato até confirmar.

## Timeline (comentários e solução)

`GET /api.php/v2/Assistance/Ticket/{id}/Timeline` — confirmado ao vivo,
retorna `200` (lista vazia em chamado sem timeline).

Sub-recurso de escrita confirmado ao vivo:
`POST /api.php/v2/Assistance/Ticket/{id}/Timeline/Followup` com
`{"content": "..."}` retorna `201 Created` com
`{"id": ..., "href": "/Assistance/Ticket/{id}/Timeline/Followup/{id}"}`.

O formato exato dos itens de timeline (`Followup`, `Task`, `Solution`,
`Document`) listados por `GET .../Timeline` não foi testado ao vivo (a
timeline estava vazia no momento do teste) — não documentamos os campos até
confirmar.

## Escrita (Sprint 4)

Confirmado ao vivo:

- Criar chamado: `POST /api.php/v2/Assistance/Ticket` com `{name, content}`
  — corpo achatado, sem envelope `input`. Resposta: `201 Created` com
  `{"id": ...,"href": "..."}`.
- Comentar: `POST /api.php/v2/Assistance/Ticket/{id}/Timeline/Followup` com
  `{content}`. É o sub-recurso `/Followup`, não `/Timeline` direto (esse é
  só GET).
- Atualizar: `PATCH /api.php/v2/Assistance/Ticket/{id}` com JSON parcial —
  confirmado com `{"name": "..."}`, retorna `200` com o objeto completo
  atualizado.
