# GLPI Agent Lab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir um kit de laboratório (ambiente Docker + corpus sintético + enunciado) que alunos externos de 4º semestre usam para desenvolver, em 16 semanas, um agente de IA sobre a base de conhecimento e os chamados de um GLPI 11.

**Architecture:** Três partes independentes num único repositório. `lab/` traz um `docker-compose` com MariaDB + GLPI 11 fixado, onde o banco sobe já povoado a partir de um `seed.sql` congelado — o aluno nunca roda o instalador. `seed/` é um gerador Node/TypeScript determinístico que fala com a API v2 do GLPI para produzir esse dump; roda apenas na máquina do autor. `docs/` traz enunciado, rubrica, notas de API e uma coleção `.http` neutra de linguagem.

**Tech Stack:** Docker Compose, MariaDB 10.11, PHP 8.3 + Apache, GLPI 11.0.x (tarball oficial), Node 20 + TypeScript, Vitest, `undici`/fetch nativo.

## Global Constraints

- **GLPI fixado em 11.0.x** — versão exata gravada como ARG no Dockerfile, nunca `latest`. Um bump de minor no meio do semestre produz turmas com ambientes divergentes.
- **Nenhuma imagem GLPI de terceiro.** A imagem é construída no repositório a partir de `php:8.3-apache` + tarball oficial da release.
- **API v2 apenas** (`/api.php/v2`, OAuth2 Bearer). A API legada `/apirest.php` não é usada no kit.
- **Listagens da v2 retornam HTTP 206.** Todo cliente do kit trata 200–299 como sucesso.
- **Corpus 100% sintético.** Nenhum dado real de cliente, nenhum dump de produção, em nenhuma etapa.
- **Nunca apontar nada deste repositório para `suporte.chipcia.com.br`.** Toda descoberta e geração roda contra o lab local.
- **Gerador determinístico:** PRNG com semente fixa, sem `Math.random()`, sem `Date.now()` fora do ancoramento explícito de datas.
- **Datas relativas ao build:** as datas do corpus são ancoradas em `HOJE - N dias`, nunca absolutas.
- **Kit é neutro de linguagem para o aluno.** A fronteira autor↔aluno é HTTP. Nenhum código de agente, esqueleto de aplicação ou SDK é entregue.
- **Idioma de todo conteúdo voltado ao aluno:** português do Brasil.
- **`<ROTA_KB>` e `<ROTA_KB_CONFIRMADA_NA_TASK_2>` são marcadores.** A Task 2 descobre o caminho real da base de conhecimento na v2 e o substitui em `docs/api-glpi-v2.md`, `docs/glpi.http`, `seed/src/gerar.ts` e `scripts/verificar-lab.sh`. Nenhuma task posterior à 2 pode ficar com o marcador no arquivo final.
- **`COLE_AQUI` em `lab/oauth-client.md` e `docs/glpi.http`** é substituído pelas credenciais reais capturadas na Task 2, Step 3.

---

### Task 1: Ambiente GLPI 11 que sobe do zero

Entrega um `docker compose up` que instala GLPI 11 e responde HTTP 200. Ainda sem seed — a instalação ainda roda pelo console. Essa é a base sobre a qual toda descoberta posterior acontece.

**Files:**
- Create: `lab/Dockerfile`
- Create: `lab/docker-compose.yml`
- Create: `lab/.env.example`
- Create: `scripts/verificar-lab.sh`

**Interfaces:**
- Consumes: nada.
- Produces: um GLPI acessível em `http://localhost:8080`, banco `glpi` no serviço `db`, usuário `glpi`/`glpi`, root `root`. Login GLPI padrão `glpi`/`glpi`. Nome dos serviços compose: `db` e `glpi`. Tasks seguintes dependem desses nomes exatos.

- [ ] **Step 1: Escrever o script de verificação (o teste)**

`scripts/verificar-lab.sh`:

```bash
#!/usr/bin/env bash
# Verifica que o lab está de pé e utilizável.
set -euo pipefail

BASE="${GLPI_BASE:-http://localhost:8080}"
falhas=0

checar() {
  local descricao="$1" esperado="$2" obtido="$3"
  if [ "$esperado" = "$obtido" ]; then
    echo "  ok   $descricao"
  else
    echo "  FALHA $descricao (esperado: $esperado, obtido: $obtido)"
    falhas=$((falhas + 1))
  fi
}

echo "Verificando lab em $BASE"

codigo=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/index.php" || echo 000)
checar "GLPI responde na raiz" "200" "$codigo"

# O instalador não pode estar acessível: se estiver, o banco não foi instalado.
instalador=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/install/install.php" || echo 000)
if [ "$instalador" = "200" ]; then
  echo "  FALHA instalador ainda acessível — banco não foi instalado"
  falhas=$((falhas + 1))
else
  echo "  ok   instalador não está exposto"
fi

if [ "$falhas" -ne 0 ]; then
  echo "FALHOU: $falhas verificação(ões)"
  exit 1
fi
echo "TUDO OK"
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
chmod +x scripts/verificar-lab.sh && ./scripts/verificar-lab.sh
```

Esperado: `FALHA GLPI responde na raiz (esperado: 200, obtido: 000)` e saída com código 1. Nada está no ar ainda.

- [ ] **Step 3: Escrever o Dockerfile**

`lab/Dockerfile`:

```dockerfile
FROM php:8.3-apache

# Versão fixada deliberadamente — ver Global Constraints.
ARG GLPI_VERSION=11.0.1

RUN apt-get update && apt-get install -y --no-install-recommends \
      libpng-dev libjpeg-dev libfreetype6-dev libzip-dev libicu-dev \
      libxml2-dev libbz2-dev libldap2-dev libsodium-dev \
      default-mysql-client curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-configure ldap --with-libdir=lib/x86_64-linux-gnu \
    && docker-php-ext-install -j"$(nproc)" \
       mysqli gd intl zip bz2 ldap exif opcache sodium

RUN a2enmod rewrite

RUN curl -fsSL \
      "https://github.com/glpi-project/glpi/releases/download/${GLPI_VERSION}/glpi-${GLPI_VERSION}.tgz" \
      -o /tmp/glpi.tgz \
    && tar -xzf /tmp/glpi.tgz -C /var/www \
    && rm /tmp/glpi.tgz \
    && chown -R www-data:www-data /var/www/glpi

# GLPI 11 serve a partir de public/
ENV APACHE_DOCUMENT_ROOT=/var/www/glpi/public
RUN sed -ri 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' \
      /etc/apache2/sites-available/*.conf /etc/apache2/apache2.conf \
    && printf '<Directory /var/www/glpi/public>\n  AllowOverride All\n  Require all granted\n</Directory>\n' \
       > /etc/apache2/conf-available/glpi.conf \
    && a2enconf glpi

WORKDIR /var/www/glpi
```

- [ ] **Step 4: Escrever o compose e o .env.example**

`lab/docker-compose.yml`:

```yaml
services:
  db:
    image: mariadb:10.11
    environment:
      MARIADB_ROOT_PASSWORD: root
      MARIADB_DATABASE: glpi
      MARIADB_USER: glpi
      MARIADB_PASSWORD: glpi
    command: >
      --character-set-server=utf8mb4
      --collation-server=utf8mb4_unicode_ci
    volumes:
      - db-data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "healthcheck.sh", "--connect", "--innodb_initialized"]
      interval: 5s
      timeout: 5s
      retries: 30

  glpi:
    build:
      context: .
      args:
        GLPI_VERSION: ${GLPI_VERSION:-11.0.1}
    ports:
      - "${GLPI_PORT:-8080}:80"
    depends_on:
      db:
        condition: service_healthy
    volumes:
      - glpi-files:/var/www/glpi/files

volumes:
  db-data:
  glpi-files:
```

`lab/.env.example`:

```dotenv
# Versão do GLPI usada pelo lab. Não altere durante o semestre.
GLPI_VERSION=11.0.1
# Porta local onde o GLPI fica acessível.
GLPI_PORT=8080
```

- [ ] **Step 5: Subir e descobrir o comando de instalação do console**

GLPI 10 usava `glpi:database:install`; GLPI 11 renomeou comandos e mantém aliases. Descobrir o nome real em vez de adivinhar:

```bash
cd lab && cp -n .env.example .env && docker compose up -d --build
docker compose exec -u www-data glpi php bin/console list | grep -i 'database'
```

Anotar o nome exato do comando de instalação que aparecer (esperado: `database:install`, possivelmente com alias `glpi:database:install`).

- [ ] **Step 6: Instalar o banco**

```bash
cd lab && docker compose exec -u www-data glpi php bin/console database:install \
  --db-host=db --db-name=glpi --db-user=glpi --db-password=glpi \
  --default-language=pt_BR --no-interaction
```

Se o comando não existir com esse nome, usar o nome descoberto no Step 5.

- [ ] **Step 7: Rodar a verificação e confirmar que passa**

```bash
./scripts/verificar-lab.sh
```

Esperado: `TUDO OK`.

Se `instalador ainda acessível` falhar, remover o diretório de instalação: `docker compose exec glpi rm -rf /var/www/glpi/public/install` não é o caminho certo — o correto é confirmar que `database:install` gravou o marcador de instalação; investigar antes de deletar arquivos.

- [ ] **Step 8: Registrar a versão confirmada**

Se a versão baixada não for exatamente `11.0.1`, atualizar o `ARG GLPI_VERSION` do Dockerfile e o `.env.example` para a versão 11.0.x que efetivamente funcionou, e anotá-la no commit.

- [ ] **Step 9: Commit**

```bash
git add lab/Dockerfile lab/docker-compose.yml lab/.env.example scripts/verificar-lab.sh
git commit -m "feat(lab): ambiente GLPI 11 + MariaDB que sobe do zero"
```

---

### Task 2: Confirmar a API v2 e criar o cliente OAuth

Resolve o risco aberto do spec: descobrir o endpoint da base de conhecimento na v2. Também cria o cliente OAuth de credenciais fixas que o aluno vai usar. Sem isso, nem o gerador nem o enunciado podem ser escritos.

**Files:**
- Create: `docs/api-glpi-v2.md`
- Create: `lab/oauth-client.md`
- Create: `scripts/descobrir-api.sh`

**Interfaces:**
- Consumes: lab de pé da Task 1 (serviços `db` e `glpi`, GLPI em `localhost:8080`).
- Produces: `docs/api-glpi-v2.md` documentando o caminho exato de leitura da KB (o valor que a Task 4 e a coleção `.http` da Task 7 consomem); `lab/oauth-client.md` com `client_id` e `client_secret` literais usados por todas as tasks seguintes e pelo aluno.

- [ ] **Step 1: Escrever o script de descoberta**

`scripts/descobrir-api.sh`:

```bash
#!/usr/bin/env bash
# Lista as rotas da API v2 desta instância, a partir do swagger real.
# Nas notas do ChipDash, /v2/openapi.json vem vazio; doc.json é a fonte boa.
set -euo pipefail

BASE="${GLPI_BASE:-http://localhost:8080}"
FILTRO="${1:-}"

for caminho in /api.php/v2.3.0/doc.json /api.php/v2/doc.json /api.php/doc.json; do
  corpo=$(curl -s "$BASE$caminho" || true)
  if [ "${#corpo}" -gt 500 ]; then
    echo "# swagger encontrado em $caminho (${#corpo} bytes)"
    echo "$corpo" | python3 -c '
import json,sys
spec = json.load(sys.stdin)
for rota in sorted(spec.get("paths", {})):
    print(rota)
' | { [ -n "$FILTRO" ] && grep -i "$FILTRO" || cat; }
    exit 0
  fi
done

echo "Nenhum swagger com conteúdo encontrado em $BASE" >&2
exit 1
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
chmod +x scripts/descobrir-api.sh && ./scripts/descobrir-api.sh knowbase
```

Esperado neste momento: falha por falta de autenticação ou swagger vazio. Se já listar rotas, ótimo — seguir para o Step 5.

- [ ] **Step 3: Criar o cliente OAuth pela interface do GLPI**

O secret é armazenado de forma derivada, então inseri-lo por SQL na mão é frágil. Criar pela interface uma única vez e capturar o valor exibido:

1. Abrir `http://localhost:8080`, entrar com `glpi` / `glpi`.
2. Ir em **Configurar → Geral → API** (em GLPI 11, a seção de clientes OAuth).
3. Criar um cliente com nome `Laboratorio Alunos`, habilitando os grants
   **Password** e **Refresh token**, e o escopo **api**.
4. Copiar o `client_id` e o `client_secret` mostrados na criação — o secret
   normalmente só aparece uma vez.

- [ ] **Step 4: Registrar as credenciais**

`lab/oauth-client.md` (substituir os valores pelos reais capturados no Step 3):

```markdown
# Cliente OAuth do laboratório

Já vem criado no `seed.sql`. Não é preciso cadastrar nada no GLPI.

- **client_id:** `COLE_AQUI_O_CLIENT_ID_REAL`
- **client_secret:** `COLE_AQUI_O_CLIENT_SECRET_REAL`
- **grants:** password, refresh_token
- **escopo:** api

Usuário do laboratório: `glpi` / `glpi` (perfil Super-Admin).
```

- [ ] **Step 5: Obter um token e listar as rotas**

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/api.php/token \
  -H 'Content-Type: application/json' \
  -d '{"grant_type":"password","client_id":"<ID>","client_secret":"<SECRET>","username":"glpi","password":"glpi","scope":"api"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')
echo "${TOKEN:0:20}..."
curl -s "http://localhost:8080/api.php/v2.3.0/doc.json" -H "Authorization: Bearer $TOKEN" \
  | python3 -c 'import json,sys; [print(r) for r in sorted(json.load(sys.stdin).get("paths",{}))]' \
  | grep -i -E 'knowbase|knowledge'
```

Esperado: uma ou mais rotas de base de conhecimento. Candidatos prováveis:
`/Assistance/KnowbaseItem`, `/Tools/KnowbaseItem`, `/KnowBaseItem`.

Confirmar na mesma listagem as outras duas rotas de escrita que a Task 7 usa —
elas estão assumidas, não confirmadas nas notas do ChipDash:

```bash
curl -s "http://localhost:8080/api.php/v2.3.0/doc.json" -H "Authorization: Bearer $TOKEN" \
  | python3 -c 'import json,sys; [print(r) for r in sorted(json.load(sys.stdin).get("paths",{}))]' \
  | grep -i -E 'category|user'
```

Anotar os caminhos reais de **categoria de chamado** (assumido
`/Assistance/ITILCategory`) e de **usuário** (assumido `/Administration/User`).
Se divergirem, corrigir `seed/src/gerar.ts` na Task 7.

- [ ] **Step 6: Confirmar leitura e escrita da KB ao vivo**

Para o caminho descoberto (substituir `<ROTA_KB>`):

```bash
curl -s -o /dev/null -w 'GET lista: %{http_code}\n' \
  "http://localhost:8080/api.php/v2<ROTA_KB>" -H "Authorization: Bearer $TOKEN"

curl -s -X POST "http://localhost:8080/api.php/v2<ROTA_KB>" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Teste de sondagem","answer":"<p>conteudo</p>"}'
```

Esperado: `GET` retorna 200 ou 206; `POST` retorna 200/201 com um `id`.

**Se o POST não funcionar**, o gerador da Task 4 escreve os artigos direto no banco (`glpi_knowbaseitems`) em vez de pela API — o dump congelado é o mesmo de qualquer forma. Registrar qual dos dois caminhos vale.

- [ ] **Step 7: Escrever a documentação de API**

`docs/api-glpi-v2.md` — versão enxuta e sanitizada, cobrindo apenas o que o aluno precisa:

```markdown
# API do GLPI 11 (v2) — o que você precisa saber

Base: `http://localhost:8080/api.php`

## Autenticação (OAuth2)

`POST /api.php/token` com JSON:

    {"grant_type":"password","client_id":"...","client_secret":"...",
     "username":"glpi","password":"glpi","scope":"api"}

Devolve `{access_token, refresh_token, expires_in: 3600}`. Todas as demais
chamadas levam o header `Authorization: Bearer <access_token>`.

As credenciais estão em `lab/oauth-client.md`. O token expira em 1 hora —
seu agente precisa renovar (mesmo endpoint, `grant_type: refresh_token`).

## Armadilhas que custam horas

- **Listagens retornam HTTP 206**, não 200. Trate 200–299 como sucesso.
- **Paginação** por `?range=0-199`. O `range` às vezes é ignorado; o header
  `Content-Range` é a fonte confiável.
- **Não existe** `/Ticket/{id}/Followup`. Comentários vêm pelo **Timeline**.
- Tickets na lixeira têm `is_deleted: true` — filtre.
- A API legada `/apirest.php` **não** aceita o Bearer da v2. Não use.

## Chamados

- Lista: `GET /api.php/v2/Assistance/Ticket`
- Detalhe: `GET /api.php/v2/Assistance/Ticket/{id}` (mesmo shape da lista)
- Dropdowns já vêm expandidos inline: `status`, `category`, `entity` são
  objetos `{id, name}`, não IDs soltos.

Campos úteis: `id`, `name` (título), `content` (HTML), `status`, `priority`,
`urgency`, `impact`, `category`, `entity`, `user_recipient`, `team`,
`date_creation`, `date_mod`, `date_solve`, `date_close`.

### `team[]` — quem está no chamado

Cada item traz `{role, display_name, id, type}`. O **responsável técnico** é o
item com `role === "assigned"`. `role` também pode ser `requester` ou `observer`.

## Timeline (comentários e solução)

`GET /api.php/v2/Assistance/Ticket/{id}/Timeline`

Array de `{type, item}`, com `type` em `Followup` | `Task` | `Solution` |
`Document`. Para comentários use `type === "Followup"`: `item.content` é o
texto, `item.user.name` o autor, `item.date` a data, `item.is_private` indica
comentário interno.

Para a **solução** aplicada, use `type === "Solution"`.

## Base de conhecimento

- Lista: `GET /api.php/v2<ROTA_KB>`
- Detalhe: `GET /api.php/v2<ROTA_KB>/{id}`

Campos: `id`, `name` (título), `answer` (conteúdo HTML), `date_creation`.
O conteúdo é **HTML** — converta para texto antes de indexar.

## Escrita (Sprint 4)

- Criar chamado: `POST /api.php/v2/Assistance/Ticket` com `{name, content, priority?}`
  — corpo achatado, sem envelope `input`. A resposta pode trazer só `{id}`.
- Comentar: `POST /api.php/v2/Assistance/Ticket/{id}/Timeline/Followup` com `{content}`.
  Note que é o sub-recurso `/Followup`, não `/Timeline` direto (esse é só GET).
- Atualizar: `PATCH /api.php/v2/Assistance/Ticket/{id}`. Nunca com corpo vazio.
```

Substituir `<ROTA_KB>` pelo caminho real confirmado no Step 5.

- [ ] **Step 8: Commit**

```bash
git add docs/api-glpi-v2.md lab/oauth-client.md scripts/descobrir-api.sh
git commit -m "docs: confirma endpoints da API v2 e cliente OAuth do lab"
```

---

### Task 3: Fundação do gerador — PRNG determinístico e datas ancoradas

As duas propriedades que o spec exige do corpus (determinismo e datas relativas) são a base de tudo que a Task 4 e a Task 5 geram. Elas vêm primeiro e com testes próprios, porque um erro aqui contamina todo o corpus silenciosamente.

**Files:**
- Create: `seed/package.json`
- Create: `seed/tsconfig.json`
- Create: `seed/vitest.config.ts`
- Create: `seed/src/aleatorio.ts`
- Create: `seed/src/datas.ts`
- Test: `seed/test/aleatorio.test.ts`
- Test: `seed/test/datas.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `criarAleatorio(semente: number): Aleatorio`
  - `interface Aleatorio { inteiro(min: number, max: number): number; escolher<T>(itens: readonly T[]): T; pesado<T>(itens: readonly [T, number][]): T; decimal(): number }`
  - `criarCalendario(hoje: Date): Calendario`
  - `interface Calendario { diasAtras(n: number): Date; formatar(d: Date): string }` — `formatar` devolve `YYYY-MM-DD HH:MM:SS` (formato que o GLPI aceita).

- [ ] **Step 1: Escrever os testes**

`seed/test/aleatorio.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { criarAleatorio } from '../src/aleatorio'

describe('criarAleatorio', () => {
  it('produz a mesma sequência para a mesma semente', () => {
    const a = criarAleatorio(42)
    const b = criarAleatorio(42)
    const seqA = Array.from({ length: 20 }, () => a.inteiro(0, 1000))
    const seqB = Array.from({ length: 20 }, () => b.inteiro(0, 1000))
    expect(seqA).toEqual(seqB)
  })

  it('produz sequências diferentes para sementes diferentes', () => {
    const a = criarAleatorio(1)
    const b = criarAleatorio(2)
    const seqA = Array.from({ length: 20 }, () => a.inteiro(0, 1000))
    const seqB = Array.from({ length: 20 }, () => b.inteiro(0, 1000))
    expect(seqA).not.toEqual(seqB)
  })

  it('respeita os limites de inteiro, inclusive nas pontas', () => {
    const r = criarAleatorio(7)
    const vistos = new Set<number>()
    for (let i = 0; i < 500; i++) vistos.add(r.inteiro(1, 3))
    expect([...vistos].sort()).toEqual([1, 2, 3])
  })

  it('escolher devolve um item da lista', () => {
    const r = criarAleatorio(3)
    const itens = ['a', 'b', 'c'] as const
    for (let i = 0; i < 50; i++) expect(itens).toContain(r.escolher(itens))
  })

  it('pesado respeita a proporção declarada', () => {
    const r = criarAleatorio(11)
    const contagem = { raro: 0, comum: 0 }
    for (let i = 0; i < 2000; i++) {
      contagem[r.pesado([['raro', 1], ['comum', 9]] as [('raro' | 'comum'), number][])]++
    }
    // ~10% vs ~90%; folga larga para não virar teste frágil.
    expect(contagem.raro).toBeGreaterThan(120)
    expect(contagem.raro).toBeLessThan(300)
  })
})
```

`seed/test/datas.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { criarCalendario } from '../src/datas'

describe('criarCalendario', () => {
  const hoje = new Date('2026-08-26T12:00:00Z')

  it('diasAtras recua o número exato de dias', () => {
    const cal = criarCalendario(hoje)
    const d = cal.diasAtras(10)
    const diff = (hoje.getTime() - d.getTime()) / 86_400_000
    expect(diff).toBeCloseTo(10, 5)
  })

  it('diasAtras(0) devolve a âncora', () => {
    const cal = criarCalendario(hoje)
    expect(cal.diasAtras(0).getTime()).toBe(hoje.getTime())
  })

  it('formata no formato que o GLPI aceita', () => {
    const cal = criarCalendario(hoje)
    expect(cal.formatar(new Date('2026-01-05T03:07:09Z'))).toBe('2026-01-05 03:07:09')
  })

  it('a âncora é injetada, nunca lida do relógio', () => {
    const a = criarCalendario(hoje)
    const b = criarCalendario(hoje)
    expect(a.formatar(a.diasAtras(500))).toBe(b.formatar(b.diasAtras(500)))
  })
})
```

- [ ] **Step 2: Criar a configuração do projeto**

`seed/package.json`:

```json
{
  "name": "glpi-lab-seed",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "gerar": "tsx src/gerar.ts"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "tsx": "^4.16.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

`seed/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src", "test"]
}
```

`seed/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
})
```

- [ ] **Step 3: Rodar os testes e confirmar que falham**

```bash
cd seed && npm install && npm test
```

Esperado: FAIL com `Cannot find module '../src/aleatorio'`.

- [ ] **Step 4: Implementar o PRNG**

`seed/src/aleatorio.ts`:

```typescript
export interface Aleatorio {
  /** Inteiro entre min e max, ambos inclusive. */
  inteiro(min: number, max: number): number
  escolher<T>(itens: readonly T[]): T
  /** Escolhe entre pares [valor, peso], proporcionalmente ao peso. */
  pesado<T>(itens: readonly (readonly [T, number])[]): T
  /** Decimal em [0, 1). */
  decimal(): number
}

/**
 * mulberry32 — PRNG pequeno e determinístico, sem dependência externa.
 * Math.random() é proibido no gerador: quebraria a reprodutibilidade do corpus.
 */
export function criarAleatorio(semente: number): Aleatorio {
  let estado = semente >>> 0

  const decimal = (): number => {
    estado = (estado + 0x6d2b79f5) >>> 0
    let t = estado
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }

  const inteiro = (min: number, max: number): number =>
    min + Math.floor(decimal() * (max - min + 1))

  function escolher<T>(itens: readonly T[]): T {
    if (itens.length === 0) throw new Error('escolher: lista vazia')
    return itens[inteiro(0, itens.length - 1)]!
  }

  function pesado<T>(itens: readonly (readonly [T, number])[]): T {
    const total = itens.reduce((s, [, peso]) => s + peso, 0)
    if (total <= 0) throw new Error('pesado: soma dos pesos precisa ser positiva')
    let alvo = decimal() * total
    for (const [valor, peso] of itens) {
      alvo -= peso
      if (alvo < 0) return valor
    }
    return itens[itens.length - 1]![0]
  }

  return { inteiro, escolher, pesado, decimal }
}
```

- [ ] **Step 5: Implementar o calendário**

`seed/src/datas.ts`:

```typescript
export interface Calendario {
  /** Recua n dias a partir da âncora. */
  diasAtras(n: number): Date
  /** Formata como 'YYYY-MM-DD HH:MM:SS', que é o formato aceito pelo GLPI. */
  formatar(d: Date): string
}

/**
 * A âncora é sempre injetada — o gerador nunca lê o relógio por conta própria.
 * As datas do corpus são relativas ao momento da regeneração para que perguntas
 * temporais do enunciado continuem fazendo sentido em semestres futuros.
 */
export function criarCalendario(hoje: Date): Calendario {
  const dois = (n: number): string => String(n).padStart(2, '0')

  return {
    diasAtras: (n) => new Date(hoje.getTime() - n * 86_400_000),
    formatar: (d) =>
      `${d.getUTCFullYear()}-${dois(d.getUTCMonth() + 1)}-${dois(d.getUTCDate())} ` +
      `${dois(d.getUTCHours())}:${dois(d.getUTCMinutes())}:${dois(d.getUTCSeconds())}`,
  }
}
```

- [ ] **Step 6: Rodar os testes e confirmar que passam**

```bash
cd seed && npm test
```

Esperado: 9 testes passando.

- [ ] **Step 7: Commit**

```bash
git add seed/
git commit -m "feat(seed): PRNG determinístico e calendário ancorado"
```

---

### Task 4: Cliente da API v2 no gerador

O gerador precisa autenticar e escrever no GLPI. Isolado numa task própria porque é a única parte do gerador que fala com a rede, e é onde as armadilhas da v2 (206, corpo achatado) precisam ficar encapsuladas.

**Files:**
- Create: `seed/src/cliente.ts`
- Test: `seed/test/cliente.test.ts`

**Interfaces:**
- Consumes: credenciais de `lab/oauth-client.md` (Task 2).
- Produces:
  - `criarCliente(config: ConfigCliente): Promise<Cliente>`
  - `interface ConfigCliente { base: string; clientId: string; clientSecret: string; usuario: string; senha: string; buscar?: typeof fetch }`
  - `interface Cliente { get<T>(caminho: string): Promise<T>; post<T>(caminho: string, corpo: unknown): Promise<T> }`
  - `caminho` é relativo a `/api.php/v2` (ex.: `'/Assistance/Ticket'`).

- [ ] **Step 1: Escrever os testes**

`seed/test/cliente.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { criarCliente } from '../src/cliente'

const CONFIG_BASE = {
  base: 'http://lab:8080',
  clientId: 'id',
  clientSecret: 'segredo',
  usuario: 'glpi',
  senha: 'glpi',
}

const respostaToken = () =>
  new Response(JSON.stringify({ access_token: 'TOK', refresh_token: 'REF', expires_in: 3600 }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

describe('criarCliente', () => {
  it('autentica no endpoint de token antes de qualquer chamada', async () => {
    const buscar = vi.fn().mockResolvedValueOnce(respostaToken())
    await criarCliente({ ...CONFIG_BASE, buscar: buscar as unknown as typeof fetch })

    expect(buscar).toHaveBeenCalledTimes(1)
    const [url, init] = buscar.mock.calls[0]!
    expect(url).toBe('http://lab:8080/api.php/token')
    expect(JSON.parse(init.body).grant_type).toBe('password')
  })

  it('manda o Bearer nas chamadas seguintes', async () => {
    const buscar = vi
      .fn()
      .mockResolvedValueOnce(respostaToken())
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))

    const cliente = await criarCliente({ ...CONFIG_BASE, buscar: buscar as unknown as typeof fetch })
    await cliente.get('/Assistance/Ticket')

    const [url, init] = buscar.mock.calls[1]!
    expect(url).toBe('http://lab:8080/api.php/v2/Assistance/Ticket')
    expect(init.headers.Authorization).toBe('Bearer TOK')
  })

  it('aceita HTTP 206 como sucesso — a v2 pagina com 206', async () => {
    const buscar = vi
      .fn()
      .mockResolvedValueOnce(respostaToken())
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 1 }]), { status: 206 }))

    const cliente = await criarCliente({ ...CONFIG_BASE, buscar: buscar as unknown as typeof fetch })
    await expect(cliente.get('/Assistance/Ticket')).resolves.toEqual([{ id: 1 }])
  })

  it('lança erro com corpo legível quando a resposta falha', async () => {
    const buscar = vi
      .fn()
      .mockResolvedValueOnce(respostaToken())
      .mockResolvedValueOnce(new Response('campo obrigatório ausente', { status: 400 }))

    const cliente = await criarCliente({ ...CONFIG_BASE, buscar: buscar as unknown as typeof fetch })
    await expect(cliente.post('/Assistance/Ticket', {})).rejects.toThrow(
      /400.*campo obrigatório ausente/s,
    )
  })

  it('envia o corpo achatado no post, sem envelope input', async () => {
    const buscar = vi
      .fn()
      .mockResolvedValueOnce(respostaToken())
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 9 }), { status: 201 }))

    const cliente = await criarCliente({ ...CONFIG_BASE, buscar: buscar as unknown as typeof fetch })
    await cliente.post('/Assistance/Ticket', { name: 'x' })

    const corpo = JSON.parse(buscar.mock.calls[1]![1].body)
    expect(corpo).toEqual({ name: 'x' })
    expect(corpo.input).toBeUndefined()
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd seed && npm test -- cliente
```

Esperado: FAIL com `Cannot find module '../src/cliente'`.

- [ ] **Step 3: Implementar o cliente**

`seed/src/cliente.ts`:

```typescript
export interface ConfigCliente {
  base: string
  clientId: string
  clientSecret: string
  usuario: string
  senha: string
  /** Injetável para teste. */
  buscar?: typeof fetch
}

export interface Cliente {
  get<T>(caminho: string): Promise<T>
  post<T>(caminho: string, corpo: unknown): Promise<T>
}

export async function criarCliente(config: ConfigCliente): Promise<Cliente> {
  const buscar = config.buscar ?? fetch
  const raiz = config.base.replace(/\/+$/, '')

  const resposta = await buscar(`${raiz}/api.php/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'password',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      username: config.usuario,
      password: config.senha,
      scope: 'api',
    }),
  })

  if (!resposta.ok) {
    throw new Error(`falha ao obter token: ${resposta.status} ${await resposta.text()}`)
  }
  const { access_token: token } = (await resposta.json()) as { access_token: string }

  async function chamar<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
    const r = await buscar(`${raiz}/api.php/v2${caminho}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
    })

    // A v2 responde 206 em listagens paginadas — 2xx inteiro é sucesso.
    if (r.status < 200 || r.status > 299) {
      throw new Error(`${metodo} ${caminho} → ${r.status} ${await r.text()}`)
    }
    return (await r.json()) as T
  }

  return {
    get: (caminho) => chamar('GET', caminho),
    post: (caminho, corpo) => chamar('POST', caminho, corpo),
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd seed && npm test -- cliente
```

Esperado: 5 testes passando.

- [ ] **Step 5: Commit**

```bash
git add seed/src/cliente.ts seed/test/cliente.test.ts
git commit -m "feat(seed): cliente da API v2 com OAuth e tratamento de 206"
```

---

### Task 5: Catálogo de conteúdo — categorias, usuários e 40 artigos de KB

O conteúdo é dado, não lógica: fica num módulo próprio para que regenerar o corpus com mais artigos não exija tocar no código de geração. Os pares quase-duplicados exigidos pelo spec são verificados por teste, porque são fáceis de perder numa edição futura.

**Files:**
- Create: `seed/src/catalogo/categorias.ts`
- Create: `seed/src/catalogo/usuarios.ts`
- Create: `seed/src/catalogo/artigos.ts`
- Test: `seed/test/catalogo.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `CATEGORIAS: readonly Categoria[]` com `interface Categoria { chave: string; nome: string }`
  - `USUARIOS: readonly Usuario[]` com `interface Usuario { login: string; nome: string; sobrenome: string; tecnico: boolean }`
  - `ARTIGOS: readonly Artigo[]` com `interface Artigo { titulo: string; categoria: string; corpo: string; parDe?: string }`
  - `corpo` é HTML. `parDe` referencia o `titulo` do artigo quase-duplicado.

- [ ] **Step 1: Escrever os testes**

`seed/test/catalogo.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { CATEGORIAS } from '../src/catalogo/categorias'
import { USUARIOS } from '../src/catalogo/usuarios'
import { ARTIGOS } from '../src/catalogo/artigos'

describe('catálogo', () => {
  it('tem 6 categorias com chaves únicas', () => {
    expect(CATEGORIAS).toHaveLength(6)
    expect(new Set(CATEGORIAS.map((c) => c.chave)).size).toBe(6)
  })

  it('tem ao menos 15 usuários, com técnicos entre eles', () => {
    expect(USUARIOS.length).toBeGreaterThanOrEqual(15)
    expect(USUARIOS.filter((u) => u.tecnico).length).toBeGreaterThanOrEqual(4)
    expect(new Set(USUARIOS.map((u) => u.login)).size).toBe(USUARIOS.length)
  })

  it('tem ao menos 40 artigos com títulos únicos', () => {
    expect(ARTIGOS.length).toBeGreaterThanOrEqual(40)
    expect(new Set(ARTIGOS.map((a) => a.titulo)).size).toBe(ARTIGOS.length)
  })

  it('todo artigo aponta para uma categoria existente', () => {
    const chaves = new Set(CATEGORIAS.map((c) => c.chave))
    for (const a of ARTIGOS) expect(chaves).toContain(a.categoria)
  })

  it('tem ao menos 3 pares quase-duplicados, e cada par se referencia', () => {
    const pares = ARTIGOS.filter((a) => a.parDe !== undefined)
    expect(pares.length).toBeGreaterThanOrEqual(3)

    const porTitulo = new Map(ARTIGOS.map((a) => [a.titulo, a]))
    for (const a of pares) {
      const irmao = porTitulo.get(a.parDe!)
      expect(irmao, `par ausente para "${a.titulo}"`).toBeDefined()
      expect(irmao!.categoria).toBe(a.categoria)
    }
  })

  it('varia bastante o tamanho dos artigos', () => {
    const tamanhos = ARTIGOS.map((a) => a.corpo.length)
    expect(Math.min(...tamanhos)).toBeLessThan(700)
    expect(Math.max(...tamanhos)).toBeGreaterThan(2500)
  })

  it('o corpo é HTML', () => {
    for (const a of ARTIGOS) expect(a.corpo).toMatch(/<(p|ul|ol|h[23])>/)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd seed && npm test -- catalogo
```

Esperado: FAIL com `Cannot find module '../src/catalogo/categorias'`.

- [ ] **Step 3: Escrever categorias e usuários**

`seed/src/catalogo/categorias.ts`:

```typescript
export interface Categoria {
  chave: string
  nome: string
}

export const CATEGORIAS: readonly Categoria[] = [
  { chave: 'rede', nome: 'Rede e Conectividade' },
  { chave: 'acesso', nome: 'Acessos e Senhas' },
  { chave: 'impressao', nome: 'Impressão' },
  { chave: 'email', nome: 'E-mail e Colaboração' },
  { chave: 'erp', nome: 'Sistema ERP' },
  { chave: 'equipamento', nome: 'Equipamentos' },
]
```

`seed/src/catalogo/usuarios.ts`:

```typescript
export interface Usuario {
  login: string
  nome: string
  sobrenome: string
  tecnico: boolean
}

export const USUARIOS: readonly Usuario[] = [
  { login: 'ana.ribeiro', nome: 'Ana', sobrenome: 'Ribeiro', tecnico: true },
  { login: 'bruno.tavares', nome: 'Bruno', sobrenome: 'Tavares', tecnico: true },
  { login: 'carla.menezes', nome: 'Carla', sobrenome: 'Menezes', tecnico: true },
  { login: 'diego.fontes', nome: 'Diego', sobrenome: 'Fontes', tecnico: true },
  { login: 'elisa.moraes', nome: 'Elisa', sobrenome: 'Moraes', tecnico: true },
  { login: 'fabio.andrade', nome: 'Fábio', sobrenome: 'Andrade', tecnico: false },
  { login: 'gisele.pires', nome: 'Gisele', sobrenome: 'Pires', tecnico: false },
  { login: 'heitor.campos', nome: 'Heitor', sobrenome: 'Campos', tecnico: false },
  { login: 'irene.duarte', nome: 'Irene', sobrenome: 'Duarte', tecnico: false },
  { login: 'joana.vasques', nome: 'Joana', sobrenome: 'Vasques', tecnico: false },
  { login: 'kleber.rocha', nome: 'Kleber', sobrenome: 'Rocha', tecnico: false },
  { login: 'lucia.barros', nome: 'Lúcia', sobrenome: 'Barros', tecnico: false },
  { login: 'marcos.leal', nome: 'Marcos', sobrenome: 'Leal', tecnico: false },
  { login: 'nadia.correia', nome: 'Nádia', sobrenome: 'Correia', tecnico: false },
  { login: 'otavio.simoes', nome: 'Otávio', sobrenome: 'Simões', tecnico: false },
  { login: 'paula.nogueira', nome: 'Paula', sobrenome: 'Nogueira', tecnico: false },
]
```

- [ ] **Step 4: Escrever os artigos**

`seed/src/catalogo/artigos.ts` começa assim, e deve chegar a **no mínimo 40 entradas**:

```typescript
export interface Artigo {
  titulo: string
  categoria: string
  corpo: string
  /** Título do artigo quase-duplicado, quando existe um. */
  parDe?: string
}

export const ARTIGOS: readonly Artigo[] = [
  // --- Par quase-duplicado 1: VPN por sistema operacional ---
  {
    titulo: 'Configurar a VPN corporativa no Windows',
    categoria: 'rede',
    parDe: 'Configurar a VPN corporativa no macOS',
    corpo: `<p>Este procedimento vale para estações Windows 10 e 11 já ingressadas no domínio.</p>
<h3>Antes de começar</h3>
<ul><li>Você precisa do seu usuário de rede e do token de segundo fator já cadastrado.</li>
<li>A estação precisa estar fora da rede interna — dentro do escritório a VPN não conecta.</li></ul>
<h3>Passo a passo</h3>
<ol><li>Abra <strong>Configurações → Rede e Internet → VPN</strong>.</li>
<li>Clique em <strong>Adicionar VPN</strong>.</li>
<li>Em provedor, escolha <em>Windows (interno)</em>.</li>
<li>No endereço do servidor, informe <code>vpn.exemplo.local</code>.</li>
<li>Tipo de VPN: <em>IKEv2</em>. Tipo de informações de entrada: <em>Usuário e senha</em>.</li>
<li>Salve e clique em <strong>Conectar</strong>. Aprove a notificação no aplicativo de segundo fator.</li></ol>
<h3>Se não conectar</h3>
<p>O erro mais comum é o 809, que indica bloqueio de porta na rede de origem. Redes de hotel e
alguns provedores móveis bloqueiam a porta UDP 500. Teste usando o roteamento do celular.
Persistindo, abra chamado na categoria Rede e Conectividade informando o código do erro.</p>`,
  },
  {
    titulo: 'Configurar a VPN corporativa no macOS',
    categoria: 'rede',
    parDe: 'Configurar a VPN corporativa no Windows',
    corpo: `<p>Procedimento para macOS 13 (Ventura) ou superior.</p>
<h3>Antes de começar</h3>
<ul><li>Tenha em mãos seu usuário de rede e o segundo fator ativo.</li>
<li>Assim como no Windows, a conexão só funciona fora da rede interna.</li></ul>
<h3>Passo a passo</h3>
<ol><li>Abra <strong>Ajustes do Sistema → Rede</strong>.</li>
<li>Clique no menu <strong>...</strong> e escolha <strong>Adicionar Configuração de VPN → IKEv2</strong>.</li>
<li>Em endereço do servidor e ID remoto, informe <code>vpn.exemplo.local</code>.</li>
<li>Em autenticação, escolha <em>Nome de usuário</em> e preencha suas credenciais de rede.</li>
<li>Clique em <strong>Criar</strong> e depois em <strong>Conectar</strong>.</li></ol>
<h3>Se não conectar</h3>
<p>No macOS o sintoma típico é a conexão cair sozinha após alguns segundos, normalmente por
perfil de configuração antigo. Remova perfis de VPN anteriores em
<strong>Ajustes do Sistema → Privacidade e Segurança → Perfis</strong> e refaça o procedimento.</p>`,
  },
  // --- Par quase-duplicado 2: reset de senha por público ---
  {
    titulo: 'Redefinir a senha de rede pelo autoatendimento',
    categoria: 'acesso',
    parDe: 'Redefinir a senha de rede com o suporte',
    corpo: `<p>Use este caminho quando você <strong>ainda consegue acessar</strong> seu e-mail
ou seu segundo fator.</p>
<ol><li>Acesse <code>https://senha.exemplo.local</code>.</li>
<li>Informe seu usuário de rede e confirme o código enviado ao segundo fator.</li>
<li>Defina a nova senha respeitando a política: mínimo de 12 caracteres, com letras
maiúsculas, minúsculas e números, e diferente das últimas cinco senhas usadas.</li></ol>
<p>A nova senha vale imediatamente para e-mail e ERP, mas a estação Windows só reconhece
após um bloqueio e desbloqueio de tela conectado à rede.</p>`,
  },
  {
    titulo: 'Redefinir a senha de rede com o suporte',
    categoria: 'acesso',
    parDe: 'Redefinir a senha de rede pelo autoatendimento',
    corpo: `<p>Use este caminho quando você <strong>perdeu o acesso</strong> ao e-mail e ao
segundo fator, e por isso não consegue usar o autoatendimento.</p>
<ol><li>Abra chamado na categoria Acessos e Senhas, ou ligue para o ramal do suporte.</li>
<li>O atendente confirma sua identidade com dados cadastrais — este passo não é
dispensável, mesmo que você conheça o atendente.</li>
<li>Você recebe uma senha provisória, que expira em 24 horas e precisa ser trocada
no primeiro acesso.</li></ol>
<p>O suporte nunca solicita sua senha atual. Se alguém pedir, encerre e comunique a equipe
de segurança.</p>`,
  },
  // --- Par quase-duplicado 3: impressora local x em rede ---
  {
    titulo: 'Instalar impressora de rede no Windows',
    categoria: 'impressao',
    parDe: 'Instalar impressora USB local no Windows',
    corpo: `<p>As impressoras dos andares são publicadas no servidor de impressão e não exigem
download de driver.</p>
<ol><li>Pressione <kbd>Win + R</kbd> e digite <code>\\\\impressao.exemplo.local</code>.</li>
<li>Localize a fila do seu andar, no padrão <code>IMP-ANDAR-COR</code>.</li>
<li>Clique com o botão direito e escolha <strong>Conectar</strong>.</li></ol>
<p>Se a fila não aparecer, você provavelmente não está na VPN ou na rede interna.
Filas duplicadas com sufixo numérico indicam instalação antiga: remova as antigas.</p>`,
  },
  {
    titulo: 'Instalar impressora USB local no Windows',
    categoria: 'impressao',
    parDe: 'Instalar impressora de rede no Windows',
    corpo: `<p>Impressoras conectadas diretamente por cabo USB à estação, comuns em recepções
e almoxarifados.</p>
<ol><li>Conecte o cabo e aguarde o reconhecimento automático.</li>
<li>Se o Windows não achar o driver, baixe-o do site do fabricante — não use drivers
genéricos, que causam impressão de páginas em branco.</li>
<li>Em <strong>Configurações → Bluetooth e dispositivos → Impressoras</strong>, confirme que
o dispositivo aparece como pronto.</li></ol>
<p>Impressora USB não é compartilhada com o andar. Para atender mais de uma pessoa, solicite
a publicação no servidor de impressão pela categoria Impressão.</p>`,
  },
  // Os 34 artigos restantes entram aqui, seguindo os temas do Step 4.
  // catalogo.test.ts é o critério de pronto: ele falha enquanto houver menos
  // de 40 artigos, tamanhos pouco variados ou categoria inexistente.
]
```

Escrever os artigos restantes seguindo três regras que os testes verificam: tamanho variado (pelo menos um abaixo de 700 caracteres e um acima de 2500), corpo em HTML, e categoria existente. Temas sugeridos por categoria: **rede** (Wi-Fi de visitante, lentidão, cabo de rede, DNS), **acesso** (bloqueio por tentativas, acesso a pasta compartilhada, novo colaborador, desligamento), **impressao** (atolamento, toner, digitalizar para e-mail, cota), **email** (assinatura, lista de distribuição, spam, caixa cheia, e-mail em celular), **erp** (primeiro acesso, erro ao emitir nota, relatório travado, fechamento mensal, permissão de módulo), **equipamento** (solicitar notebook, monitor, troca de bateria, formatação, devolução).

- [ ] **Step 5: Rodar e confirmar que passa**

```bash
cd seed && npm test -- catalogo
```

Esperado: 7 testes passando. Se o teste de contagem falhar, ainda faltam artigos.

- [ ] **Step 6: Commit**

```bash
git add seed/src/catalogo seed/test/catalogo.test.ts
git commit -m "feat(seed): catálogo de categorias, usuários e artigos de KB"
```

---

### Task 6: Gerar chamados com distribuição não-uniforme e timelines

Os chamados são a parte com mais regras de negócio do gerador: distribuição enviesada, sazonalidade, e timeline apenas nos fechados. Vale sua própria task porque é a que mais quebra silenciosamente — um viés errado só aparece quando um aluno faz uma pergunta analítica na Sprint 2.

**Files:**
- Create: `seed/src/chamados.ts`
- Test: `seed/test/chamados.test.ts`

**Interfaces:**
- Consumes: `Aleatorio` e `Calendario` (Task 3), `CATEGORIAS`/`USUARIOS` (Task 5).
- Produces:
  - `gerarChamados(opcoes: OpcoesChamados): ChamadoGerado[]`
  - `interface OpcoesChamados { quantidade: number; aleatorio: Aleatorio; calendario: Calendario }`
  - `interface ChamadoGerado { titulo: string; descricao: string; categoria: string; status: 'novo' | 'em_atendimento' | 'solucionado' | 'fechado'; prioridade: number; solicitante: string; tecnico: string | null; criadoEm: string; timeline: ItemTimeline[] }`
  - `interface ItemTimeline { tipo: 'followup' | 'solucao'; autor: string; conteudo: string; data: string }`

- [ ] **Step 1: Escrever os testes**

`seed/test/chamados.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { criarAleatorio } from '../src/aleatorio'
import { criarCalendario } from '../src/datas'
import { gerarChamados } from '../src/chamados'
import { CATEGORIAS } from '../src/catalogo/categorias'
import { USUARIOS } from '../src/catalogo/usuarios'

const opcoes = (quantidade = 300) => ({
  quantidade,
  aleatorio: criarAleatorio(2026),
  calendario: criarCalendario(new Date('2026-08-26T12:00:00Z')),
})

describe('gerarChamados', () => {
  it('gera a quantidade pedida', () => {
    expect(gerarChamados(opcoes())).toHaveLength(300)
  })

  it('é determinístico', () => {
    expect(gerarChamados(opcoes())).toEqual(gerarChamados(opcoes()))
  })

  it('usa apenas categorias e usuários do catálogo', () => {
    const chaves = new Set(CATEGORIAS.map((c) => c.chave))
    const logins = new Set(USUARIOS.map((u) => u.login))
    const tecnicos = new Set(USUARIOS.filter((u) => u.tecnico).map((u) => u.login))

    for (const c of gerarChamados(opcoes())) {
      expect(chaves).toContain(c.categoria)
      expect(logins).toContain(c.solicitante)
      if (c.tecnico !== null) expect(tecnicos).toContain(c.tecnico)
    }
  })

  it('a distribuição por categoria não é uniforme — há uma dominante', () => {
    const porCategoria = new Map<string, number>()
    for (const c of gerarChamados(opcoes())) {
      porCategoria.set(c.categoria, (porCategoria.get(c.categoria) ?? 0) + 1)
    }
    const contagens = [...porCategoria.values()].sort((a, b) => b - a)
    // A dominante tem pelo menos o dobro da menos frequente.
    expect(contagens[0]!).toBeGreaterThan(contagens[contagens.length - 1]! * 2)
  })

  it('cobre cerca de 18 meses de histórico', () => {
    const datas = gerarChamados(opcoes()).map((c) => new Date(c.criadoEm.replace(' ', 'T') + 'Z'))
    const maisAntigo = Math.min(...datas.map((d) => d.getTime()))
    const dias = (new Date('2026-08-26T12:00:00Z').getTime() - maisAntigo) / 86_400_000
    expect(dias).toBeGreaterThan(500)
    expect(dias).toBeLessThanOrEqual(550)
  })

  it('tem picos sazonais — algum mês concentra bem mais que a média', () => {
    const porMes = new Map<string, number>()
    for (const c of gerarChamados(opcoes())) {
      const mes = c.criadoEm.slice(0, 7)
      porMes.set(mes, (porMes.get(mes) ?? 0) + 1)
    }
    const contagens = [...porMes.values()]
    const media = contagens.reduce((s, n) => s + n, 0) / contagens.length
    expect(Math.max(...contagens)).toBeGreaterThan(media * 1.8)
  })

  it('só chamados solucionados ou fechados têm solução na timeline', () => {
    for (const c of gerarChamados(opcoes())) {
      const temSolucao = c.timeline.some((i) => i.tipo === 'solucao')
      if (c.status === 'solucionado' || c.status === 'fechado') {
        expect(temSolucao, `chamado "${c.titulo}" deveria ter solução`).toBe(true)
      } else {
        expect(temSolucao, `chamado "${c.titulo}" não deveria ter solução`).toBe(false)
      }
    }
  })

  it('chamados novos não têm técnico atribuído', () => {
    for (const c of gerarChamados(opcoes())) {
      if (c.status === 'novo') expect(c.tecnico).toBeNull()
      else expect(c.tecnico).not.toBeNull()
    }
  })

  it('a timeline nunca é anterior à abertura', () => {
    for (const c of gerarChamados(opcoes())) {
      for (const item of c.timeline) {
        expect(item.data >= c.criadoEm, `timeline de "${c.titulo}" antes da abertura`).toBe(true)
      }
    }
  })

  it('a prioridade fica na faixa do GLPI (1 a 5)', () => {
    for (const c of gerarChamados(opcoes())) {
      expect(c.prioridade).toBeGreaterThanOrEqual(1)
      expect(c.prioridade).toBeLessThanOrEqual(5)
    }
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd seed && npm test -- chamados
```

Esperado: FAIL com `Cannot find module '../src/chamados'`.

- [ ] **Step 3: Implementar o gerador de chamados**

`seed/src/chamados.ts`:

```typescript
import type { Aleatorio } from './aleatorio'
import type { Calendario } from './datas'
import { USUARIOS } from './catalogo/usuarios'

export type StatusChamado = 'novo' | 'em_atendimento' | 'solucionado' | 'fechado'

export interface ItemTimeline {
  tipo: 'followup' | 'solucao'
  autor: string
  conteudo: string
  data: string
}

export interface ChamadoGerado {
  titulo: string
  descricao: string
  categoria: string
  status: StatusChamado
  prioridade: number
  solicitante: string
  tecnico: string | null
  criadoEm: string
  timeline: ItemTimeline[]
}

export interface OpcoesChamados {
  quantidade: number
  aleatorio: Aleatorio
  calendario: Calendario
}

const DIAS_DE_HISTORICO = 540 // ~18 meses

/**
 * Categorias com peso: "rede" domina de propósito, para que perguntas
 * analíticas do enunciado tenham resposta não-óbvia.
 */
const PESO_CATEGORIA: readonly (readonly [string, number])[] = [
  ['rede', 32],
  ['acesso', 22],
  ['erp', 16],
  ['impressao', 13],
  ['email', 11],
  ['equipamento', 6],
]

const PESO_STATUS: readonly (readonly [StatusChamado, number])[] = [
  ['fechado', 58],
  ['solucionado', 17],
  ['em_atendimento', 15],
  ['novo', 10],
]

/** Tipado como tuplas: sem isso o TS infere number[][] e pesado() não compila. */
const PESO_PRIORIDADE: readonly (readonly [number, number])[] = [
  [1, 6],
  [2, 18],
  [3, 46],
  [4, 22],
  [5, 8],
]

const ASSUNTOS: Record<string, readonly (readonly [string, string])[]> = {
  rede: [
    ['VPN não conecta fora do escritório', 'Tento conectar de casa e a conexão cai após alguns segundos.'],
    ['Internet lenta no terceiro andar', 'Desde ontem as páginas demoram muito para abrir na sala 302.'],
    ['Sem acesso ao Wi-Fi de visitantes', 'O convidado da reunião não consegue autenticar na rede.'],
    ['Cabo de rede sem link', 'A luz da tomada de rede não acende na estação nova.'],
  ],
  acesso: [
    ['Usuário bloqueado após tentativas', 'Errei a senha três vezes e agora não entro mais.'],
    ['Sem permissão na pasta do setor', 'Preciso acessar a pasta de contratos e recebo acesso negado.'],
    ['Criar acesso para novo colaborador', 'Colaborador começa segunda e precisa de rede, e-mail e ERP.'],
    ['Revogar acessos de desligado', 'Encerrar todos os acessos do colaborador desligado hoje.'],
  ],
  erp: [
    ['Erro ao emitir nota fiscal', 'O sistema retorna erro de validação ao finalizar a emissão.'],
    ['Relatório mensal não carrega', 'A tela fica processando e nunca conclui.'],
    ['Liberar módulo de estoque', 'Preciso do módulo de estoque liberado no meu perfil.'],
    ['Lentidão no fechamento', 'Durante o fechamento o sistema fica muito lento.'],
  ],
  impressao: [
    ['Impressora do andar atolando papel', 'A cada duas páginas o papel enrosca.'],
    ['Toner acabou', 'A impressão está saindo falhada e o painel indica toner baixo.'],
    ['Digitalizar para e-mail não funciona', 'O scanner não envia o arquivo para o meu e-mail.'],
    ['Cota de impressão esgotada', 'Recebo aviso de cota excedida ao imprimir.'],
  ],
  email: [
    ['Caixa de e-mail cheia', 'Não consigo mais receber mensagens.'],
    ['Configurar e-mail no celular', 'Preciso do e-mail corporativo no aparelho novo.'],
    ['Muito spam na caixa de entrada', 'Aumentou bastante o volume de mensagens indesejadas.'],
    ['Incluir na lista de distribuição', 'Preciso receber os comunicados do setor.'],
  ],
  equipamento: [
    ['Solicitar notebook para novo colaborador', 'Equipamento para o colaborador que inicia no mês que vem.'],
    ['Monitor com falha de imagem', 'A tela pisca e às vezes fica preta.'],
    ['Bateria do notebook não segura carga', 'Dura menos de vinte minutos fora da tomada.'],
    ['Devolução de equipamento', 'Preciso devolver o notebook do colaborador desligado.'],
  ],
}

const RESPOSTAS_TECNICO: readonly string[] = [
  'Chamado recebido, vou verificar e retorno em seguida.',
  'Consegui reproduzir o problema aqui. Estou trabalhando na correção.',
  'Preciso de mais um dado: você consegue informar o horário exato em que ocorreu?',
  'Acionei a equipe responsável e estou acompanhando.',
]

const SOLUCOES: Record<string, readonly string[]> = {
  rede: [
    'Porta UDP 500 bloqueada na rede de origem. Orientado a usar outra rede; conexão normalizada.',
    'Switch do andar reiniciado e porta reconfigurada. Conectividade restabelecida.',
  ],
  acesso: [
    'Conta desbloqueada e senha provisória enviada. Usuário confirmou o acesso.',
    'Permissão concedida no grupo do setor. Usuário validou o acesso à pasta.',
  ],
  erp: [
    'Cadastro fiscal do produto estava incompleto. Corrigido, emissão concluída.',
    'Cache do relatório limpo e job reprocessado. Relatório voltou a carregar.',
  ],
  impressao: [
    'Rolete de tração substituído. Testes de impressão sem atolamento.',
    'Toner substituído e contador zerado. Impressão normalizada.',
  ],
  email: [
    'Caixa expandida e itens antigos arquivados. Recebimento normalizado.',
    'Perfil recriado no aplicativo. E-mails sincronizando corretamente.',
  ],
  equipamento: [
    'Equipamento substituído e termo de responsabilidade assinado.',
    'Bateria trocada em garantia. Autonomia dentro do esperado.',
  ],
}

export function gerarChamados({ quantidade, aleatorio, calendario }: OpcoesChamados): ChamadoGerado[] {
  const solicitantes = USUARIOS.map((u) => u.login)
  const tecnicos = USUARIOS.filter((u) => u.tecnico).map((u) => u.login)
  const chamados: ChamadoGerado[] = []

  for (let i = 0; i < quantidade; i++) {
    const categoria = aleatorio.pesado(PESO_CATEGORIA)
    const status = aleatorio.pesado(PESO_STATUS)
    const [titulo, descricao] = aleatorio.escolher(ASSUNTOS[categoria]!)

    const diasAtras = sortearDiaComSazonalidade(aleatorio)
    const abertura = calendario.diasAtras(diasAtras)
    const criadoEm = calendario.formatar(abertura)

    const tecnico = status === 'novo' ? null : aleatorio.escolher(tecnicos)
    const timeline: ItemTimeline[] = []

    if (tecnico !== null) {
      const quantosFollowups = aleatorio.inteiro(1, 3)
      for (let f = 0; f < quantosFollowups; f++) {
        timeline.push({
          tipo: 'followup',
          autor: tecnico,
          conteudo: aleatorio.escolher(RESPOSTAS_TECNICO),
          data: calendario.formatar(
            new Date(abertura.getTime() + (f + 1) * aleatorio.inteiro(2, 20) * 3_600_000),
          ),
        })
      }
    }

    if (status === 'solucionado' || status === 'fechado') {
      timeline.push({
        tipo: 'solucao',
        autor: tecnico!,
        conteudo: aleatorio.escolher(SOLUCOES[categoria]!),
        data: calendario.formatar(
          new Date(abertura.getTime() + aleatorio.inteiro(24, 200) * 3_600_000),
        ),
      })
    }

    chamados.push({
      titulo,
      descricao: `<p>${descricao}</p>`,
      categoria,
      status,
      prioridade: aleatorio.pesado(PESO_PRIORIDADE),
      solicitante: aleatorio.escolher(solicitantes),
      tecnico,
      criadoEm,
      timeline,
    })
  }

  return chamados
}

/**
 * Sorteia "há quantos dias" o chamado foi aberto, com dois picos sazonais.
 * Uma distribuição uniforme tornaria toda pergunta temporal do enunciado trivial.
 */
function sortearDiaComSazonalidade(aleatorio: Aleatorio): number {
  const faixa = aleatorio.pesado([
    ['pico_recente', 25],
    ['pico_antigo', 20],
    ['normal', 55],
  ] as const)

  if (faixa === 'pico_recente') return aleatorio.inteiro(20, 50)
  if (faixa === 'pico_antigo') return aleatorio.inteiro(300, 330)
  return aleatorio.inteiro(1, DIAS_DE_HISTORICO)
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd seed && npm test -- chamados
```

Esperado: 10 testes passando. Se `cobre cerca de 18 meses` falhar, ajustar `DIAS_DE_HISTORICO`; se `picos sazonais` falhar, aumentar o peso das faixas de pico.

- [ ] **Step 5: Commit**

```bash
git add seed/src/chamados.ts seed/test/chamados.test.ts
git commit -m "feat(seed): chamados com distribuição enviesada e timelines"
```

---

### Task 7: Popular o GLPI e congelar o seed.sql

Junta as peças anteriores num executável, roda contra o lab e congela o resultado. Ao final desta task o `docker compose up` do aluno já entrega o GLPI povoado.

**Files:**
- Create: `seed/src/gerar.ts`
- Create: `seed/README.md`
- Modify: `lab/docker-compose.yml` (montar `seed.sql` no initdb)
- Modify: `scripts/verificar-lab.sh` (verificar o corpus)
- Create: `lab/seed.sql` (artefato gerado)

**Interfaces:**
- Consumes: `criarCliente` (Task 4), `CATEGORIAS`/`USUARIOS`/`ARTIGOS` (Task 5), `gerarChamados` (Task 6), rota da KB confirmada (Task 2).
- Produces: `lab/seed.sql` versionado.

- [ ] **Step 1: Estender a verificação para exigir o corpus**

Acrescentar ao final de `scripts/verificar-lab.sh`, antes do bloco `if [ "$falhas" -ne 0 ]`:

```bash
# --- corpus ---
TOKEN=$(curl -s -X POST "$BASE/api.php/token" \
  -H 'Content-Type: application/json' \
  -d "{\"grant_type\":\"password\",\"client_id\":\"${CLIENT_ID:?defina CLIENT_ID}\",\"client_secret\":\"${CLIENT_SECRET:?defina CLIENT_SECRET}\",\"username\":\"glpi\",\"password\":\"glpi\",\"scope\":\"api\"}" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin).get("access_token",""))' 2>/dev/null || echo "")

if [ -z "$TOKEN" ]; then
  echo "  FALHA não consegui obter token OAuth"
  falhas=$((falhas + 1))
else
  echo "  ok   token OAuth obtido"

  contar() {
    curl -s "$BASE/api.php/v2$1?range=0-999" -H "Authorization: Bearer $TOKEN" \
      | python3 -c 'import json,sys; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)'
  }

  tickets=$(contar /Assistance/Ticket)
  if [ "$tickets" -ge 250 ]; then
    echo "  ok   chamados no corpus: $tickets"
  else
    echo "  FALHA poucos chamados: $tickets (esperado >= 250)"
    falhas=$((falhas + 1))
  fi

  artigos=$(contar "$ROTA_KB")
  if [ "$artigos" -ge 40 ]; then
    echo "  ok   artigos de KB: $artigos"
  else
    echo "  FALHA poucos artigos de KB: $artigos (esperado >= 40)"
    falhas=$((falhas + 1))
  fi
fi
```

Definir `ROTA_KB` no topo do script com o caminho confirmado na Task 2:

```bash
ROTA_KB="${ROTA_KB:-<ROTA_KB_CONFIRMADA_NA_TASK_2>}"
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
CLIENT_ID=... CLIENT_SECRET=... ./scripts/verificar-lab.sh
```

Esperado: `FALHA poucos chamados: 0` e `FALHA poucos artigos de KB: 0` — o GLPI ainda está vazio.

- [ ] **Step 3: Escrever o executável do gerador**

`seed/src/gerar.ts`:

```typescript
import { criarCliente } from './cliente'
import { criarAleatorio } from './aleatorio'
import { criarCalendario } from './datas'
import { CATEGORIAS } from './catalogo/categorias'
import { USUARIOS } from './catalogo/usuarios'
import { ARTIGOS } from './catalogo/artigos'
import { gerarChamados } from './chamados'

// Rota confirmada na Task 2. Ajustar aqui se a instância divergir.
const ROTA_KB = '<ROTA_KB_CONFIRMADA_NA_TASK_2>'
const SEMENTE = 2026
const QUANTIDADE_CHAMADOS = 300

function exigir(nome: string): string {
  const valor = process.env[nome]
  if (!valor) throw new Error(`variável de ambiente ${nome} é obrigatória`)
  return valor
}

async function principal(): Promise<void> {
  const cliente = await criarCliente({
    base: process.env.GLPI_BASE ?? 'http://localhost:8080',
    clientId: exigir('CLIENT_ID'),
    clientSecret: exigir('CLIENT_SECRET'),
    usuario: 'glpi',
    senha: 'glpi',
  })

  const aleatorio = criarAleatorio(SEMENTE)
  // Âncora explícita: as datas do corpus são relativas ao momento da regeneração.
  const calendario = criarCalendario(new Date())

  console.log('criando categorias...')
  const idCategoria = new Map<string, number>()
  for (const c of CATEGORIAS) {
    const r = await cliente.post<{ id: number }>('/Assistance/ITILCategory', { name: c.nome })
    idCategoria.set(c.chave, r.id)
  }

  console.log('criando usuários...')
  const idUsuario = new Map<string, number>()
  for (const u of USUARIOS) {
    const r = await cliente.post<{ id: number }>('/Administration/User', {
      name: u.login,
      firstname: u.nome,
      realname: u.sobrenome,
      password: 'laboratorio',
      password2: 'laboratorio',
    })
    idUsuario.set(u.login, r.id)
  }

  console.log(`criando ${ARTIGOS.length} artigos de KB...`)
  for (const a of ARTIGOS) {
    await cliente.post(ROTA_KB, { name: a.titulo, answer: a.corpo })
  }

  const chamados = gerarChamados({ quantidade: QUANTIDADE_CHAMADOS, aleatorio, calendario })
  console.log(`criando ${chamados.length} chamados...`)

  const STATUS_GLPI: Record<string, number> = {
    novo: 1,
    em_atendimento: 2,
    solucionado: 5,
    fechado: 6,
  }

  for (const c of chamados) {
    const criado = await cliente.post<{ id: number }>('/Assistance/Ticket', {
      name: c.titulo,
      content: c.descricao,
      priority: c.prioridade,
      itilcategories_id: idCategoria.get(c.categoria),
      date: c.criadoEm,
    })

    if (c.tecnico) {
      await cliente.post(`/Assistance/Ticket/${criado.id}/TeamMember`, {
        type: 'User',
        id: idUsuario.get(c.tecnico),
        role: 'assigned',
      })
    }

    for (const item of c.timeline) {
      const sub = item.tipo === 'solucao' ? 'Solution' : 'Followup'
      await cliente.post(`/Assistance/Ticket/${criado.id}/Timeline/${sub}`, {
        content: item.conteudo,
      })
    }

    // O status vai por último: o GLPI recalcula status ao adicionar solução.
    await cliente.post(`/Assistance/Ticket/${criado.id}`, { status: STATUS_GLPI[c.status] })
  }

  console.log('pronto.')
}

principal().catch((erro) => {
  console.error(erro)
  process.exit(1)
})
```

- [ ] **Step 4: Rodar o gerador contra um lab limpo**

```bash
cd lab && docker compose down -v && docker compose up -d --build
# reinstalar o banco (Task 1, Step 6), depois recriar o cliente OAuth (Task 2, Step 3)
cd ../seed && CLIENT_ID=... CLIENT_SECRET=... npm run gerar
```

Se `PATCH` for necessário para o status (a v2 usa `PATCH` para atualização, conforme as notas), trocar a última chamada por um método `patch` acrescentado ao cliente da Task 4 — nesse caso, acrescentar antes um teste em `cliente.test.ts` espelhando o teste de `post`.

- [ ] **Step 5: Congelar o dump**

```bash
cd lab && docker compose exec -T db \
  mariadb-dump -uroot -proot --single-transaction --routines --events \
  --add-drop-table --default-character-set=utf8mb4 glpi > seed.sql
wc -l seed.sql
```

Esperado: dezenas de milhares de linhas.

- [ ] **Step 6: Montar o dump no initdb**

Em `lab/docker-compose.yml`, no serviço `db`, acrescentar ao bloco `volumes`:

```yaml
      - ./seed.sql:/docker-entrypoint-initdb.d/01-seed.sql:ro
```

- [ ] **Step 7: Verificar o ciclo completo de reset**

```bash
cd lab && docker compose down -v && docker compose up -d
sleep 60
cd .. && CLIENT_ID=... CLIENT_SECRET=... ./scripts/verificar-lab.sh
```

Esperado: `TUDO OK`, com `chamados no corpus: 300` e `artigos de KB: 40` — **sem** rodar o instalador nem o gerador. Esse é o critério de pronto da task inteira.

- [ ] **Step 8: Documentar o gerador**

`seed/README.md`:

```markdown
# Gerador do corpus (uso do autor)

**Alunos não precisam disto.** O corpus já vem pronto em `lab/seed.sql`.

Este gerador existe para regenerar o corpus quando se quiser mais volume,
outra categoria, ou datas atualizadas para um novo semestre.

## Regenerar

    cd lab && docker compose down -v
    # subir sem o seed.sql montado, instalar o banco e recriar o cliente OAuth
    cd ../seed && npm install
    CLIENT_ID=... CLIENT_SECRET=... npm run gerar
    cd ../lab && docker compose exec -T db mariadb-dump -uroot -proot \
      --single-transaction --add-drop-table --default-character-set=utf8mb4 glpi > seed.sql

## Invariantes

- **Determinismo:** semente fixa em `src/gerar.ts`. Não use `Math.random()`.
- **Datas relativas:** ancoradas em `new Date()` no momento da regeneração,
  nunca absolutas — do contrário as perguntas temporais do enunciado quebram
  em semestres futuros.
- **Sem dado real.** Todo o conteúdo é inventado.
```

- [ ] **Step 9: Commit**

```bash
git add seed/src/gerar.ts seed/README.md lab/docker-compose.yml lab/seed.sql scripts/verificar-lab.sh
git commit -m "feat(seed): popula o GLPI e congela o corpus em seed.sql"
```

---

### Task 8: Coleção HTTP para o aluno

A única muleta técnica do kit. Neutra de linguagem: destrava a integração sem entregar lógica de agente.

**Files:**
- Create: `docs/glpi.http`

**Interfaces:**
- Consumes: `docs/api-glpi-v2.md` e `lab/oauth-client.md` (Task 2), lab povoado (Task 7).
- Produces: nada consumido por código.

- [ ] **Step 1: Escrever a coleção**

`docs/glpi.http` (substituir os valores de `@clientId` e `@clientSecret` pelos reais, e `<ROTA_KB>` pela rota confirmada):

```http
### Coleção de requisições do laboratório
# Abra este arquivo no VS Code (extensão REST Client), Bruno ou IntelliJ
# e clique em "Send Request" acima de cada bloco.
# Comece pelo primeiro: os demais dependem do token que ele devolve.

@base = http://localhost:8080
@clientId = COLE_AQUI
@clientSecret = COLE_AQUI

### 1. Obter o token (rode este primeiro)
# @name token
POST {{base}}/api.php/token
Content-Type: application/json

{
  "grant_type": "password",
  "client_id": "{{clientId}}",
  "client_secret": "{{clientSecret}}",
  "username": "glpi",
  "password": "glpi",
  "scope": "api"
}

### 2. Quem sou eu
@bearer = {{token.response.body.access_token}}

GET {{base}}/api.php/v2/session
Authorization: Bearer {{bearer}}

### 3. Listar chamados (atenção: responde 206, não 200)
GET {{base}}/api.php/v2/Assistance/Ticket?range=0-9
Authorization: Bearer {{bearer}}

### 4. Detalhe de um chamado
GET {{base}}/api.php/v2/Assistance/Ticket/1
Authorization: Bearer {{bearer}}

### 5. Timeline do chamado — é aqui que estão os comentários e a solução
# Não existe /Ticket/{id}/Followup na v2. Este é o caminho.
GET {{base}}/api.php/v2/Assistance/Ticket/1/Timeline
Authorization: Bearer {{bearer}}

### 6. Listar artigos da base de conhecimento
GET {{base}}/api.php/v2<ROTA_KB>?range=0-9
Authorization: Bearer {{bearer}}

### 7. Detalhe de um artigo — o campo "answer" é HTML
GET {{base}}/api.php/v2<ROTA_KB>/1
Authorization: Bearer {{bearer}}

### 8. Renovar o token (ele expira em 1 hora)
POST {{base}}/api.php/token
Content-Type: application/json

{
  "grant_type": "refresh_token",
  "refresh_token": "{{token.response.body.refresh_token}}",
  "client_id": "{{clientId}}",
  "client_secret": "{{clientSecret}}"
}

### 9. Criar chamado (Sprint 4 — corpo achatado, sem envelope "input")
POST {{base}}/api.php/v2/Assistance/Ticket
Authorization: Bearer {{bearer}}
Content-Type: application/json

{
  "name": "Teste do meu agente",
  "content": "<p>Chamado criado pela API durante o desenvolvimento.</p>",
  "priority": 3
}

### 10. Comentar num chamado (Sprint 4 — note o /Followup no final)
POST {{base}}/api.php/v2/Assistance/Ticket/1/Timeline/Followup
Authorization: Bearer {{bearer}}
Content-Type: application/json

{
  "content": "<p>Acompanhamento adicionado pelo agente.</p>"
}
```

- [ ] **Step 2: Executar as dez requisições e conferir**

Abrir o arquivo no editor e rodar cada bloco em ordem. Esperado: 1 devolve `access_token`; 2 a 7 devolvem 200 ou 206 com dados; 8 devolve novo token; 9 e 10 criam registros.

Se algum bloco falhar, corrigir o arquivo — ele é o primeiro contato do aluno com a API e um erro aqui custa dias de aula.

- [ ] **Step 3: Commit**

```bash
git add docs/glpi.http
git commit -m "docs: coleção HTTP de partida para os alunos"
```

---

### Task 9: Enunciado, rubrica e perguntas de referência

O documento que o aluno lê primeiro. O critério arquitetural de RAG precisa estar explícito desde a Sprint 1 — não pode surgir na correção.

**Files:**
- Create: `docs/enunciado.md`
- Create: `docs/rubrica.md`
- Create: `docs/perguntas-de-referencia.md`

**Interfaces:**
- Consumes: corpus da Task 7 (para que as perguntas citem chamados que existem).
- Produces: nada consumido por código.

- [ ] **Step 1: Escrever o enunciado**

`docs/enunciado.md`:

```markdown
# Projeto: agente de IA sobre a central de serviços

Você vai construir um agente que responde perguntas sobre a **base de
conhecimento** e os **chamados** de uma central de serviços de TI, usando um
GLPI 11 de laboratório que já vem pronto e povoado.

## Regras do projeto

- **Linguagem livre.** Escolha a que o grupo domina.
- **Sem interface gráfica.** A entrega é linha de comando ou API. Investir em
  front não conta ponto.
- **Cada grupo usa a própria chave de LLM.** Qualquer provedor serve. Nunca
  suba a chave para o repositório.
- **Todo o dado do laboratório é fictício.** Pode testar à vontade.

## Preparando o ambiente

    cd lab
    cp .env.example .env
    docker compose up -d

Em cerca de um minuto o GLPI responde em <http://localhost:8080>
(usuário `glpi`, senha `glpi`). As credenciais da API estão em
`lab/oauth-client.md`, e `docs/glpi.http` traz requisições prontas.

**Estragou a base testando?** `docker compose down -v && docker compose up -d`
devolve tudo ao estado original. Use sem medo.

## Entregas

### Sprint 0 — Reconhecimento (semanas 1 e 2)

Sem nenhuma IA. Suba o laboratório, autentique-se via OAuth e entregue um
relatório curto respondendo: quantos chamados existem, como se distribuem por
categoria e por status, quantos artigos há na base de conhecimento, e qual o
formato JSON de um chamado e de um artigo.

*Entrega:* relatório em Markdown no repositório + o código que levantou os números.

### Sprint 1 — Respostas a partir da base de conhecimento (semanas 3 a 6)

O agente responde perguntas de procedimento consultando os artigos da base.

Requisitos:
- Toda resposta **cita o artigo** de onde saiu a informação.
- Quando a base **não cobre** a pergunta, o agente diz que não sabe.
  Inventar uma resposta ou citar um artigo inexistente **reprova a sprint** —
  não é desconto de nota.
- Existe uma etapa de **recuperação** que seleciona um subconjunto de artigos
  antes de gerar a resposta.

> **Leia com atenção:** a base é pequena o bastante para caber inteira no prompt
> de um modelo moderno. Fazer isso e acertar as respostas **não** cumpre o
> requisito. Seu agente precisa funcionar igual se a base crescer dez vezes, e
> você vai precisar demonstrar isso na apresentação.

### Sprint 2 — Consultas sobre chamados (semanas 7 a 9)

"Quantos chamados abertos existem na categoria de rede?" não se responde
buscando texto parecido. Perguntas assim precisam de dado estruturado.

Requisitos:
- O agente tem uma **ferramenta** que consulta a API e devolve dado estruturado.
- O agente **decide sozinho** se a pergunta pede a base de conhecimento ou a
  ferramenta de consulta.
- Perguntas que combinam os dois caminhos são tratadas corretamente.

### Sprint 3 — Chamados parecidos (semanas 10 a 12)

Dado um chamado novo, o agente encontra chamados históricos semelhantes e propõe
a solução que funcionou neles.

Requisitos:
- A busca considera o conteúdo do chamado, não só a categoria.
- A sugestão cita **quais** chamados a embasaram.
- Chamados sem solução registrada não entram como fonte de sugestão.

### Sprint 4 — Agir sobre os chamados (semanas 13 a 15)

O agente passa a abrir chamados e adicionar acompanhamentos.

Requisitos:
- **Nada é gravado sem confirmação explícita do usuário.**
- Antes de gravar, o agente **mostra exatamente o que vai gravar**.
- Se o usuário não confirmar, nada acontece.

Este requisito não é burocracia acadêmica: é a diferença entre um agente que se
pode colocar em produção e um que não se pode.

### Semana 16 — Apresentação

Demonstração ao vivo com as perguntas de `docs/perguntas-de-referencia.md`,
mais a explicação da arquitetura. Reserve tempo para explicar **como** a
recuperação funciona — é o item de maior peso.

## Onde as coisas costumam travar

- A API responde **206** em listagens, não 200. Trate 2xx como sucesso.
- O token expira em **1 hora**. Implemente renovação cedo.
- Comentários e soluções vêm pelo **Timeline**, não por `/Followup`.
- O conteúdo dos artigos é **HTML**. Converta para texto antes de indexar.
- Alguns artigos são **quase iguais** de propósito (VPN no Windows e no macOS,
  por exemplo). Se o seu agente confunde os dois, a recuperação precisa melhorar.

Consulte `docs/api-glpi-v2.md` antes de perguntar.
```

- [ ] **Step 2: Escrever a rubrica**

`docs/rubrica.md`:

```markdown
# Rubrica de avaliação

| Critério | Peso |
|---|---|
| Recuperação e arquitetura | 30 |
| Uso de ferramentas e roteamento | 20 |
| Tratamento de erro e recusa honesta | 15 |
| Testes | 15 |
| Documentação | 10 |
| Apresentação | 10 |

## Recuperação e arquitetura (30)

O que se avalia é a **arquitetura**, não o acerto das respostas. A base do
laboratório cabe inteira no contexto de um LLM moderno, então respostas certas
não provam nada sozinhas.

- **26–30:** há uma etapa de recuperação clara e isolada, que seleciona um
  subconjunto antes da geração. O grupo demonstra que o agente continuaria
  funcionando com dez vezes mais conteúdo.
- **18–25:** existe recuperação, mas acoplada ao restante ou com escolhas mal
  justificadas (chunking arbitrário, sem controle de quantos trechos entram).
- **8–17:** recuperação rudimentar, como filtro por palavra-chave apenas.
- **0–7:** o corpus inteiro vai para o prompt. **Este item zera mesmo que a
  demonstração acerte todas as perguntas.**

## Uso de ferramentas e roteamento (20)

- **18–20:** ferramentas bem definidas devolvendo dado estruturado; o agente
  escolhe corretamente entre base de conhecimento e consulta, inclusive em
  perguntas que exigem os dois.
- **12–17:** ferramentas funcionam, mas o roteamento erra em casos limítrofes.
- **5–11:** existe consulta a chamados, mas sem roteamento — o usuário precisa
  dizer qual caminho usar.
- **0–4:** não implementado.

## Tratamento de erro e recusa honesta (15)

- Recusa quando a base não cobre a pergunta: **6 pontos**.
- Nenhuma fonte inventada em toda a demonstração: **5 pontos**.
- Trata token expirado, indisponibilidade da API e resposta 206: **4 pontos**.

Uma única citação de artigo inexistente durante a apresentação zera este critério.

## Testes (15)

- **13–15:** testes automatizados cobrindo recuperação e ferramentas, rodando
  sem depender de chamada real ao LLM.
- **8–12:** testes existem, mas cobrem só o caminho feliz.
- **3–7:** poucos testes, ou só manuais.
- **0–2:** nenhum teste.

## Documentação (10)

README que permite a outra pessoa rodar o projeto do zero; decisões de
arquitetura registradas com a justificativa.

## Apresentação (10)

Demonstração ao vivo funcionando, domínio das perguntas da banca, clareza na
explicação da arquitetura.

## Sprint 1 e Sprint 4 têm requisitos eliminatórios

- Sprint 1: inventar fonte reprova a sprint.
- Sprint 4: gravar no GLPI sem confirmação do usuário reprova a sprint.

Em ambos os casos há uma oportunidade de correção antes da nota final.
```

- [ ] **Step 3: Escrever as perguntas de referência**

`docs/perguntas-de-referencia.md` — conferir cada resposta contra o corpus real
gerado na Task 7 antes de publicar:

```markdown
# Perguntas de referência

Usadas na apresentação final. Seu agente deve dar conta das cinco categorias.
As respostas esperadas dependem do corpus do laboratório — confira antes de
assumir qualquer coisa.

## A. Base de conhecimento — resposta direta

1. Como configuro a VPN corporativa no Windows?
2. Qual o tamanho mínimo da senha de rede?
3. Como instalo a impressora do meu andar?
4. O que faço quando a caixa de e-mail enche?

## B. Base de conhecimento — recuperação ambígua

Existem pares de artigos quase iguais. O agente precisa perceber a ambiguidade
ou escolher com critério, não sortear.

5. Como configuro a VPN? *(existe artigo para Windows e para macOS)*
6. Como redefino minha senha? *(existe o caminho por autoatendimento e o com o suporte)*
7. Como instalo uma impressora? *(existe artigo para impressora de rede e para USB)*

## C. Consulta estruturada de chamados

8. Quantos chamados estão abertos no momento?
9. Qual categoria concentra mais chamados?
10. Quantos chamados de rede foram abertos nos últimos 60 dias?
11. Qual o status do chamado 42?
12. Quem é o técnico responsável pelo chamado 100?
13. Quantos chamados o técnico com mais atribuições tem?

## D. Similaridade e sugestão

14. Abri um chamado dizendo que a VPN cai depois de alguns segundos. Já
    aconteceu antes? O que resolveu?
15. Estou com papel atolando na impressora. Como isso foi resolvido antes?
16. Encontre chamados parecidos com o 7 e diga o que foi feito neles.

## E. Recusa honesta — a base não responde

O agente **precisa** dizer que não sabe. Inventar aqui reprova o critério de
recusa honesta.

17. Qual é a política de home office da empresa?
18. Quanto custa a licença do ERP?
19. Quem é o diretor de tecnologia?
20. Como solicito férias?
```

- [ ] **Step 4: Conferir as perguntas contra o corpus**

Para cada pergunta das seções C e D, executar a consulta correspondente pela
coleção `.http` ou por `curl` e confirmar que existe resposta. Chamados citados
por número (42, 100, 7) precisam existir e ter as propriedades assumidas —
ajustar os números do documento conforme o corpus real.

Para a seção E, confirmar que **nenhum** artigo da base trata desses temas.

- [ ] **Step 5: Commit**

```bash
git add docs/enunciado.md docs/rubrica.md docs/perguntas-de-referencia.md
git commit -m "docs: enunciado, rubrica e perguntas de referência"
```

---

### Task 10: README e validação em máquina limpa

O kit precisa funcionar na máquina de alguém que nunca o viu. Esta task é a única que valida isso.

**Files:**
- Create: `README.md`
- Create: `.gitignore`

**Interfaces:**
- Consumes: tudo das tasks anteriores.
- Produces: repositório pronto para publicação.

- [ ] **Step 1: Escrever o `.gitignore`**

```gitignore
node_modules/
lab/.env
*.log
.DS_Store
```

- [ ] **Step 2: Escrever o README**

`README.md`:

```markdown
# GLPI Agent Lab

Laboratório para o projeto de agente de IA sobre uma central de serviços.
Sobe um GLPI 11 já povoado com chamados e artigos fictícios, para você
construir um agente que responde sobre eles.

## Começando

    cd lab
    cp .env.example .env
    docker compose up -d

Em cerca de um minuto: <http://localhost:8080> — usuário `glpi`, senha `glpi`.

Você **não** precisa instalar o GLPI: o banco já sobe pronto.

## O que ler, nesta ordem

1. [`docs/enunciado.md`](docs/enunciado.md) — o projeto, sprint a sprint
2. [`docs/rubrica.md`](docs/rubrica.md) — como você é avaliado
3. [`docs/api-glpi-v2.md`](docs/api-glpi-v2.md) — a API, e as armadilhas dela
4. [`docs/glpi.http`](docs/glpi.http) — requisições prontas para rodar
5. [`lab/oauth-client.md`](lab/oauth-client.md) — as credenciais da API
6. [`docs/perguntas-de-referencia.md`](docs/perguntas-de-referencia.md) — as
   perguntas da apresentação final

## Recomeçar do zero

    cd lab && docker compose down -v && docker compose up -d

Isso apaga tudo que você criou no GLPI e restaura o laboratório original.
Como todo o dado é fictício, teste à vontade.

## Requisitos

Docker e Docker Compose. Nada além disso — a linguagem do seu agente é sua
escolha.

## Para o professor

`seed/` contém o gerador do corpus e não é usado pelos alunos.
Veja [`seed/README.md`](seed/README.md).
```

- [ ] **Step 3: Validar numa máquina limpa**

Simular o aluno: clonar em outro diretório, sem `node_modules` nem imagens em cache.

```bash
cd /tmp && rm -rf teste-lab && git clone /Users/rogerdepaula/Documents/projetos/trabalho/chip/glpi-agent-lab teste-lab
cd teste-lab/lab && cp .env.example .env && docker compose up -d --build
sleep 90
cd /tmp/teste-lab && CLIENT_ID=... CLIENT_SECRET=... ./scripts/verificar-lab.sh
```

Esperado: `TUDO OK` com 300 chamados e 40 artigos, **sem** nenhum passo manual
além dos três comandos do README.

Se falhar, o problema está no kit, não na máquina de teste — corrigir e repetir.

- [ ] **Step 4: Limpar o teste**

```bash
cd /tmp/teste-lab/lab && docker compose down -v && cd /tmp && rm -rf teste-lab
```

- [ ] **Step 5: Commit**

```bash
git add README.md .gitignore
git commit -m "docs: README do kit e validação em máquina limpa"
```
