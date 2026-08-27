# Cliente OAuth do laboratório

Desde a Task 7, o `lab/seed.sql` já carrega o cliente abaixo congelado no
banco — o aluno não precisa rodar nada, só `docker compose up`.
`scripts/preparar-oauth.sh` continua existindo para quem for **regenerar** o
corpus (ver `seed/README.md`): rode-o uma vez depois do `database:install`
contra um banco vazio — ele habilita a API v2 e cria o cliente abaixo, com
essas credenciais fixas. É idempotente: pode rodar de novo sem duplicar nada.

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
no `seed.sql` seria indecifrável em qualquer container novo — ver
`.superpowers/sdd/2026-08-26-glpi-agent-lab/descoberta-glpicrypt.md`. Pela
mesma razão, `lab/config_db.php`, `lab/oauth.pem` e `lab/oauth.pub` também
são fixos e montados por bind mount — ver `seed/README.md`.

**Atenção:** `lab/oauth.pem` é uma **chave privada** (assina os JWT do
`/api.php/token`), não só "um par de chaves RSA" genérico. Ela está
versionada aqui de propósito, porque é um laboratório local descartável com
dados fictícios — isso não é prática aceitável fora deste contexto; num
projeto real, chave privada nunca vai para o controle de versão.

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
declaradas acima. Desde a Task 7 essa lógica já está congelada no
`seed.sql`; o script permanece só para regenerá-lo.

## Obtendo um token

```bash
curl -s -X POST http://localhost:8080/api.php/token \
  -H 'Content-Type: application/json' \
  -d '{"grant_type":"password","client_id":"92e1a8497a5136e410301a573b8282bb","client_secret":"156df3c0f488cd8be63a5ee3731568da3afa60239bed1018c8cec9f4c5355c17","username":"glpi","password":"glpi","scope":"api"}'
```
