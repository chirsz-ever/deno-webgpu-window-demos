#!/usr/bin/env bash

THIS_DIR=$(dirname "$(realpath "$0")")
THREEJS_DIR=$(realpath "$THIS_DIR/..")

failed_demos_output=threejs_failed_demos_$(uname -s)_$(uname -m).txt

if [[ $1 == "--help" || $1 == "-h" ]]; then
    echo "Usage: $0 [demo_list_file]"
    echo "If without arguments, it runs all WebGPU demos in $THIS_DIR."
    echo "If with an argument, it runs the demos listed in the file."
    echo "If any demo fails, it will be output to $failed_demos_output."
    exit 0
fi

failed_demos_output=$PWD/$failed_demos_output
auto_test=true

if [[ -n $1 ]]; then
    demo_list=()
    while IFS='' read -r line; do demo_list+=("$line"); done < "$1"
    cd "$THREEJS_DIR/examples" || exit 1
else
    cd "$THREEJS_DIR/examples" || exit 1
    demo_list=(webgpu_*.js)
fi

failed_demos=()

i=0
total=${#demo_list[@]}
for f in "${demo_list[@]}"; do
    i=$((i + 1))
    echo -e "\033[34m[Run $i of $total]\033[0m $f"
    cmd="deno run --allow-all $f"
    if $auto_test; then
        $cmd &
        pid=$!
        ( sleep 2; kill $pid &>/dev/null ) &
        killerPid=$!
        wait $pid
        if kill -0 $killerPid &>/dev/null; then
            kill $killerPid &>/dev/null
            failed_demos+=("$f")
        fi
    else
        if ! $cmd; then
            failed_demos+=("$f")
        fi
    fi
done

if [ ${#failed_demos[@]} -ne 0 ]; then
    for f in "${failed_demos[@]}"; do
        echo "$f"
    done > "$failed_demos_output"
    echo -e "\033[31m[Error]\033[0m Some demos failed. See $failed_demos_output for details."
    exit 1
else
    rm -f "$failed_demos_output"
fi
