#!/usr/bin/env bash
# Lista as rotas da API v2 desta instância, a partir do swagger real.
#
# Descoberto na Task 2, ao vivo contra o lab local (GLPI 11.0.8):
#   - O swagger só tem conteúdo em /api.php/v2/doc.json (não em
#     /api.php/v2.3.0/doc.json nem /api.php/doc.json).
#   - O endpoint exige um token Bearer válido (não é público) e exige que a
#     "High-Level API" esteja habilitada em config (glpi_configs.enable_hlapi=1
#     no contexto 'core' — desligada por padrão numa instalação nova).
#
# Uso:
#   GLPI_BASE=http://localhost:8080 TOKEN=<access_token> ./scripts/descobrir-api.sh knowbase
set -euo pipefail

BASE="${GLPI_BASE:-http://localhost:8080}"
FILTRO="${1:-}"

if [ -z "${TOKEN:-}" ]; then
  echo "Defina a variável TOKEN com um access_token OAuth válido (ver lab/oauth-client.md)." >&2
  exit 1
fi

corpo=$(curl -s "$BASE/api.php/v2/doc.json" -H "Authorization: Bearer $TOKEN")

if [ "${#corpo}" -le 500 ]; then
  echo "Swagger vazio ou inacessível em $BASE/api.php/v2/doc.json" >&2
  echo "$corpo" >&2
  exit 1
fi

echo "# swagger encontrado em /api.php/v2/doc.json (${#corpo} bytes)"
echo "$corpo" | python3 -c '
import json,sys
spec = json.load(sys.stdin)
for rota in sorted(spec.get("paths", {})):
    print(rota)
' | { [ -n "$FILTRO" ] && grep -i "$FILTRO" || cat; }
