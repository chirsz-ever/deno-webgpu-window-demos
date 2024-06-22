#!/usr/bin/env bash

set -e
THIS_DIR=$(dirname "$(realpath "$0")")

cd "$THIS_DIR/.."

URL=https://github.com/mrdoob/three.js/blob/r165/examples/$1.html
TARGET="./threejs/$1.js"

if [[ -f $TARGET ]] || ./threejs/fetch_example.sh "$URL"; then
    echo "running $TARGET"
    deno run -A "$TARGET" --enable-validation
fi
