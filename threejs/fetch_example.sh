#!/usr/bin/env bash

if [[ $# == 0 || $1 == "-h" || $1 == "--help" ]]; then
    echo "USAGE:"
    echo "  $0 <URL>"
    echo "  $0 --refetch-all"
    exit
fi

set -e
THIS_DIR=$(dirname "$(realpath "$0")")


if [[ $1 == "--refetch-all" ]]; then
    for f in "$THIS_DIR"/webgpu_*.js; do
        URL=$(sed -nE '1s|^\s*//\s*(.*)\s*$|\1|p' "$f")
        "$0" "$URL"
    done
    exit
fi

cd "$THIS_DIR"

URL_ORIGIN=$1
if [[ $URL_ORIGIN =~ /blob/ ]]; then
    URL_RAW=${URL_ORIGIN/\/blob\//\/raw\/}
else
    URL_RAW=$URL_ORIGIN
fi

SCRIPT_FILE_NAME=$(basename "$URL_ORIGIN" ".html").js

HTML_CONTENT=$(curl -L "$URL_RAW")

TITLE=$(echo "$HTML_CONTENT" | sed -nE 's|.*<title>(.*)</title>.*|\1|p')

SCRIPT_CONTENT=$(echo "$HTML_CONTENT" | perl -ae '
if ( m|<script type="module">| ) {
    $p=true;
} elsif($p) {
    if ( m|</script>| ) {
        exit;
    }
    if (/^\s*init\(\);/) {
        print "/* POLYFILL */\n";
        print "import * as polyfill from \"./polyfill.ts\";\n";
        print "await polyfill.init(\"'"$TITLE"'\");\n\n";
    }
    ($pre_indent)=/^\t\t\t(\s+)/;
    if (s|new THREE\.CanvasTexture\( new FlakesTexture\(\) \);|textureLoader.load( "polyfill-textures/FlakesTexture.png" );|) {
        print "$pre_indent/* POLYFILL */\n";
    }
    if (s|from '\''./jsm/|from '\''three/addons/|) {
        print "$pre_indent/* POLYFILL */\n";
    }
    s|^\t\t\t||;
    print;
}')

# echo "title: $TITLE"
# echo "SCRIPT_CONTENT: $SCRIPT_CONTENT"

echo "// $URL_ORIGIN" > "$SCRIPT_FILE_NAME"
echo "$SCRIPT_CONTENT" >> "$SCRIPT_FILE_NAME"

echo "save to $SCRIPT_FILE_NAME"
