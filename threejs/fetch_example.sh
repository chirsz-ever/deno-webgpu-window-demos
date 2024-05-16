#!/usr/bin/env bash

if [[ $# == 0 ]]; then
    echo "USAGE: $0 <URL>"
    exit
fi

set -e

THIS_DIR=$(dirname "$(realpath "$0")")
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
        print "/* POLYFILL */\n";
        print "polyfill.runWindowEventLoop()";
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
    s|^\t\t\t||;
    print;
}')

# echo "title: $TITLE"
# echo "SCRIPT_CONTENT: $SCRIPT_CONTENT"

echo "// $URL_ORIGIN" > "$SCRIPT_FILE_NAME"
echo "$SCRIPT_CONTENT" >> "$SCRIPT_FILE_NAME"
