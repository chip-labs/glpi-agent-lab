#!/usr/bin/env bash
# Habilita a API v2 e garante que o cliente OAuth do laboratório existe,
# com as credenciais fixas documentadas em lab/oauth-client.md.
#
# Roda depois do `database:install` (ver lab/README ou o brief da Task 1).
# É idempotente: pode rodar de novo sem duplicar o cliente.
#
# Papel pós-Task 7: o `lab/seed.sql` já carrega o cliente OAuth congelado —
# o aluno nunca precisa rodar este script. Ele continua existindo só para
# quem for regenerar o corpus (ver seed/README.md): depois de um
# `database:install` contra um banco vazio, antes de rodar `npm run gerar`.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

cd "$SCRIPT_DIR/../lab"

GLPI_CID=$(docker compose ps -q glpi)
if [ -z "$GLPI_CID" ]; then
  echo "Container 'glpi' não está de pé. Rode 'docker compose up -d' primeiro." >&2
  exit 1
fi

docker cp "$SCRIPT_DIR/preparar-oauth.php" "$GLPI_CID:/tmp/preparar-oauth.php"
docker compose exec -u www-data -T glpi php /tmp/preparar-oauth.php
docker compose exec -u www-data -T glpi php bin/console cache:clear
