#!/usr/bin/env bash

set -e
THIS_DIR=$(dirname "$(realpath "$0")")

failed_demos_output=threejs_failed_demos_$(uname -s)_$(uname -m).txt

if [[ $1 == "--help" || $1 == "-h" ]]; then
    echo "Usage: $0 [demo_list_file]"
    echo "If without arguments, it runs all WebGPU demos in $THIS_DIR."
    echo "If with an argument, it runs the demos listed in the file."
    echo "If any demo fails, it will be output to $failed_demos_output."
    exit 0
fi

failed_demos_output=$PWD/$failed_demos_output

if [[ -n $1 ]]; then
    demo_list=()
    while IFS='' read -r line; do demo_list+=("$line"); done < "$1"
else
    cd "$THIS_DIR"
    demo_list=(webgpu_*.js)
fi

cd "$THIS_DIR"

failed_demos=()

i=0
total=${#demo_list[@]}
for f in "${demo_list[@]}"; do
    i=$((i + 1))
    echo -e "\033[34m[Run $i of $total]\033[0m $f"
    if ! deno run --allow-all "$f" --enable-validation; then
        failed_demos+=("$f")
    fi
done

if [ ${#failed_demos[@]} -ne 0 ]; then
    for f in "${failed_demos[@]}"; do
        echo "$f"
    done > "$failed_demos_output"
    echo -e "\033[31m[Error]\033[0m Some demos failed. See $failed_demos_output for details."
    exit 1
fi
