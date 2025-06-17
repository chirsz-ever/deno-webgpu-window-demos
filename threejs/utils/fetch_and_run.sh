#!/usr/bin/env bash

set -e
THIS_DIR=$(dirname "$(realpath "$0")")

cd "$THIS_DIR/../.." || exit 1

URL=https://github.com/mrdoob/three.js/blob/r175/examples/$1.html
TARGET="./threejs/examples/$1.js"

if [[ -f $TARGET ]] || bash "./threejs/utils/fetch_example.sh" "$URL"; then
    echo "running $TARGET"
    if ! deno run -A "$TARGET" && [[ "$2" != "--keep-failed" ]]; then
        echo "failed to run $TARGET"
        rm -f "$TARGET"
    fi
fi
