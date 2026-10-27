# Upstream fixtures

`templates/`, `en.json`, and `LICENSE.txt` are unmodified copies from
[csheepy/prowlers-and-paragons-fvtt](https://github.com/csheepy/prowlers-and-paragons-fvtt),
commit `b07352413f2563205664f33955be733d3363514f` (2026-10-14).
`en-2.0.1.json` is the unmodified language file at release tag `2.0.1`, commit
`85e3099` (the release and current main both identify themselves as 2.0.1).

These fixtures exercise the real template markup in isolation. Foundry-specific
Handlebars helpers are implemented by the test harness; this is not an execution
of the licensed Foundry server or a full gameplay compatibility test.

The templates and language catalog are distributed under the upstream MIT
license retained in `LICENSE.txt`. No compendium content or game-rule text is
included.
