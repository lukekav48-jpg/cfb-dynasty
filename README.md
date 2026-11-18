# CFB Dynasty

A browser college football franchise game. Coach one of 68 real programs (with fictional players): set your depth chart and game plan, call plays in the key moments or sim to the end, and chase a 12-team playoff and a national title.

## Play locally

    python3 -I -m http.server 8765 --bind 127.0.0.1

Then open http://127.0.0.1:8765/. Your franchise saves in the browser; use Settings → Export to back it up.

## Tests

    ./test.sh            # all engine tests, in macOS's built-in JavaScriptCore
    ./test.sh sim        # only tests whose name contains "sim"

Or open http://127.0.0.1:8765/tests/tests.html in a browser.

## Layout

- `src/engine/`: game logic (pure, no browser APIs)
- `src/ui/`: one module per screen
- `docs/superpowers/`: design spec and implementation plans
