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
