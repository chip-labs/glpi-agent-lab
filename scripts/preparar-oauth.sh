#!/usr/bin/env bash
# Habilita a API v2 e garante que o cliente OAuth do laboratório existe,
# com as credenciais fixas documentadas em lab/oauth-client.md.
#
# Roda depois do `database:install` (ver lab/README ou o brief da Task 1).
# É idempotente: pode rodar de novo sem duplicar o cliente.
#
# Provisório: será substituído pelo `seed.sql` da Task 7, que já vai
# carregar o banco pronto. Até lá, o lab precisa se sustentar sozinho.
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
