---
description: Generate, list, verify, and reveal deliberately vulnerable secure-code-review challenges
---

Load the `vulnlab` skill, then execute the requested factory operation.

Arguments: $ARGUMENTS

Interpret the first token as the subcommand:

- `new` — generate a new challenge. Parse the remaining arguments as `key=value` parameters (for
  example `name="Acme Notes" language=python archetype=web-app mode=single difficulty=medium`).
  Call `vulnlab_scaffold`, then follow the full pipeline in the `vulnlab` skill: build the complete
  application, add Docker assets when infrastructure is needed, write the brief README, build and run
  the app, prove the planted vulnerability with a PoC via `vulnlab_verify`, then store the Part I +
  Part II solution with `vulnlab_commit`. Never leave solution material in the working tree.
  Add `zk=true` (and optionally `zkKind=native-binary|js-bundle|bytecode|jvm|python-frozen`) for a
  **closed-source reverse-engineering challenge**: build the artifact in a temporary workspace, ship
  only `artifact/` plus a runnable driver, delete the source, and seal the source inside the solution
  (Part 0 reversing notes + source appendix). The reviewer reverse-engineers it with IDA, Binary
  Ninja, or a deobfuscator.
- `list` — call `vulnlab_list`.
- `verify <id>` — call `vulnlab_verify` for that challenge id.
- `reveal <id>` — call `vulnlab_reveal` for that challenge id.

Rules:

- Default to a **single**, real-world/CVE-grounded vulnerability planted in a full working app.
- The challenge must be blind: never put the vulnerability class, location, or exploit in
  `challenges/**`, `README.md`, or `challenge.json`.
- Only reveal a solution when the subcommand is `reveal`.
- Keep everything local: loopback-bound ports, throwaway dev secrets, intentionally-vulnerable
  banner in every challenge README.
