#!/usr/bin/env bash

set -e
THIS_DIR=$(dirname "$(realpath "$0")")

cd "$THIS_DIR"

failed_items=()

for f in webgpu_*.js; do
    echo -e "\033[34m[Run]\033[0m $f"
    if ! deno run --allow-all "$f" --enable-validation; then
        failed_items+=("$f")
    fi
done

if [ ${#failed_items[@]} -ne 0 ]; then
    echo -e "\033[31mFailed demos:\033[0m"
    for f in "${failed_items[@]}"; do
        echo "$f"
    done
fi
