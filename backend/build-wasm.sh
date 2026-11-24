#!/usr/bin/env bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "${SCRIPT_DIR}/../frontend/src/wasm"

emcc -O3 -std=c++20 \
  -I"${SCRIPT_DIR}" \
  --bind \
  -sWASM_BIGINT=1 \
  -sMODULARIZE=1 \
  -sEXPORT_ES6=1 \
  -sSINGLE_FILE=1 \
  -sENVIRONMENT='web,worker' \
  "${SCRIPT_DIR}/implementation.cpp" \
  "${SCRIPT_DIR}/bindings.cpp" \
  -o "${SCRIPT_DIR}/../frontend/src/wasm/sim.js"

echo "WASM module successfully built to frontend/src/wasm/sim.js"
