#!/usr/bin/env zsh
setopt NO_GLOB
set -euo pipefail

MTL_URL='https://api.stellar.expert/explorer/public/asset/MTL-GACKTN5DAZGWXRWB2WLM6OPBDHAMT6SJNGLJZPQMEZBUR4JUGBX2UK7V/holders?order=desc&limit=200'
MTLRECT_URL='https://api.stellar.expert/explorer/public/asset/MTLRECT-GACKTN5DAZGWXRWB2WLM6OPBDHAMT6SJNGLJZPQMEZBUR4JUGBX2UK7V/holders?order=desc&limit=200'

mkdir -p /tmp/mtl_holders

curl -sS "$MTL_URL"     -o ./mtl.json
curl -sS "$MTLRECT_URL" -o ./mtlrect.json

echo "== TOP-5 MTL =="
jq -r '._embedded.records[:5][] | "\(.account)\t\(.balance)"' ./mtl.json

echo
echo "== TOP-5 MTLRECT =="
jq -r '._embedded.records[:5][] | "\(.account)\t\(.balance)"' ./mtlrect.json
