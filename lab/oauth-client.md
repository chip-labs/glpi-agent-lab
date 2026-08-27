# Cliente OAuth do laboratório

O cliente já é criado automaticamente pela seed do banco (Task 7). Não é
preciso cadastrar nada no GLPI.

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

## Passo obrigatório: habilitar a API v2 (High-Level API)

Descoberta feita ao vivo na Task 2: uma instalação nova do GLPI 11.0.8 tem a
API v2 **desligada por padrão**. Sem isso, toda chamada em `/api.php/v2/...`
volta `403` com `"detail":"The High-Level API is disabled"`, mesmo com um
token válido. É preciso habilitar duas chaves em `glpi_configs` (contexto
`core`) antes de usar a API:

```sql
UPDATE glpi_configs SET value='1' WHERE context='core' AND name IN ('enable_api', 'enable_hlapi');
```

A Task 7 deve incluir isso no `seed.sql`. Depois de alterar, é preciso limpar
o cache do GLPI (`php bin/console cache:clear`), senão o valor antigo
continua em uso.

## Obtendo um token

```bash
curl -s -X POST http://localhost:8080/api.php/token \
  -H 'Content-Type: application/json' \
  -d '{"grant_type":"password","client_id":"92e1a8497a5136e410301a573b8282bb","client_secret":"156df3c0f488cd8be63a5ee3731568da3afa60239bed1018c8cec9f4c5355c17","username":"glpi","password":"glpi","scope":"api"}'
```
