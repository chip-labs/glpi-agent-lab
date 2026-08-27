# Cliente OAuth do laboratório

Até a Task 7 existir (que vai congelar tudo isso num `seed.sql`), rode
`scripts/preparar-oauth.sh` uma vez depois do `database:install` — ele
habilita a API v2 e cria o cliente abaixo, com essas credenciais fixas. É
idempotente: pode rodar de novo sem duplicar nada.

- **client_id:** `92e1a8497a5136e410301a573b8282bb`
- **client_secret:** `156df3c0f488cd8be63a5ee3731568da3afa60239bed1018c8cec9f4c5355c17`
- **grants:** password, refresh_token
- **escopo:** api

Usuário do laboratório: `glpi` / `glpi` (perfil Super-Admin).

## Por que essas credenciais são literais neste arquivo

O secret é armazenado **criptografado** no banco (`glpi_oauthclients.secret`),
com a chave em `lab/glpicrypt.key`. Essa chave é fixa e versionada neste
repositório — de propósito, pela mesma razão que as senhas `glpi`/`glpi` são:
é um laboratório local com dados fictícios, e a reprodutibilidade em qualquer
máquina vale mais que o sigilo aqui. Sem essa chave fixada, o secret gravado
no `seed.sql` (Task 7) seria indecifrável em qualquer container novo — ver
`.superpowers/sdd/2026-08-26-glpi-agent-lab/descoberta-glpicrypt.md`.

## Por que existe um script em vez de só este arquivo

Descoberta feita ao vivo na Task 2: uma instalação nova do GLPI 11.0.8 tem a
API v2 **desligada por padrão**. Sem habilitá-la, toda chamada em
`/api.php/v2/...` volta `403` com `"detail":"The High-Level API is
disabled"`, mesmo com um token válido. E criar o cliente OAuth com uma
interface (web ou `OAuthClient::add()`) sempre gera um `identifier`/`secret`
aleatórios, ignorando qualquer valor fornecido — não dá para fixar as
credenciais por esse caminho.

`scripts/preparar-oauth.sh` resolve os dois problemas: liga
`enable_api`/`enable_hlapi` em `glpi_configs` (contexto `core`), limpa o
cache do GLPI, e insere o cliente direto no banco com o secret já
criptografado com a chave fixa (`lab/glpicrypt.key`) — as mesmas credenciais
declaradas acima. A Task 7 deve absorver essa mesma lógica no `seed.sql`.

## Obtendo um token

```bash
curl -s -X POST http://localhost:8080/api.php/token \
  -H 'Content-Type: application/json' \
  -d '{"grant_type":"password","client_id":"92e1a8497a5136e410301a573b8282bb","client_secret":"156df3c0f488cd8be63a5ee3731568da3afa60239bed1018c8cec9f4c5355c17","username":"glpi","password":"glpi","scope":"api"}'
```
