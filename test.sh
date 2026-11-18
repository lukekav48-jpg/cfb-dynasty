#!/bin/sh
# Runs the engine tests in macOS's built-in JavaScriptCore. Usage: ./test.sh [filter]
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc
cd "$(dirname "$0")" || exit 1
out=$("$JSC" -m tests/run.js -- "$@" 2>&1)
echo "$out"
echo "$out" | tail -1 | grep -q ' 0 failed'
