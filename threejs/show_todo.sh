#!/usr/bin/env bash

set -e

this_dir=$(realpath "$(dirname "$0")")
threejs_dir=${1:-$this_dir/../../three.js/three.js-r165}

if [[ -z $1 && ! -e $threejs_dir ]]; then
    echo "usage: $0 <three.js dir>"
fi

cd "$threejs_dir/examples"

for f in webgpu_*; do
    if [[ ! -f "$this_dir/${f%.html}.js" ]]; then
        echo "${f%.html}"
    fi
done
