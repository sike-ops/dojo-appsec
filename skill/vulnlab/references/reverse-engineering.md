# ZK mode — closed-source & reverse-engineering challenges

ZK ("zero-knowledge") mode ships **no source**. The reviewer receives only a compiled, bundled, or
obfuscated artifact plus the instructions to run it, and must recover the logic themselves — with a
disassembler/decompiler (IDA, Binary Ninja, Ghidra), a JavaScript deobfuscator, or a debugger —
before they can even reach the secure-code-review step.

Use ZK mode to train the skill of auditing code you did not write and cannot read: reading
disassembly, recovering control flow, identifying dangerous API calls, and proving exploitability
from the artifact.

## Rules

1. **The working tree contains only the artifact.** Build in a temporary source workspace
   (recommended: `/tmp/opencode/zk-<id>/`), copy only the built output into
   `challenges/<id>/artifact/`, then delete the workspace.
2. **The source is sealed in the commit message.** Append the full source as a fenced source appendix
   in the solution so `vulnlab_reveal` restores it. This is the only copy.
3. **The artifact must still be runnable.** Ship a `Dockerfile` (and `docker-compose.yml` when it
   needs services) plus a README that documents how to run it and how to reach every entry point.
   The reviewer needs an oracle: a running service, a CLI, or a library with an example driver.
4. **The flaw must be reachable from outside.** For a binary, that is a CLI argument, a network
   request, a file input, or a library call from the shipped driver. Document the interface, never
   the flaw.
5. **Do not strip the ability to reason.** A challenge should be solvable with skill, not brute
   force. Keep enough structure to reconstruct logic: strings, error messages, a debug build flag, or
   a symbol for the non-planted functions. Pure stripped `-O2` with no strings is unfair, not hard.
6. **Anti-analysis is a setting, not a default.** Only add light anti-debugging/packing when the
   user asks (`difficulty=hard`), and always keep the challenge solvable.

## Artifact recipes

### Node.js — decompile a bundled library

Use when the user says "decompile a Node.js library".

- **Bundled + minified** (default): bundle with `esbuild` and minify; ship the single `.js` file plus
  a tiny `driver.js` that calls its public API.
  ```bash
  esbuild src/index.ts --bundle --minify --platform=node --outfile=artifact/lib.js
  ```
- **Heavier**: `javascript-obfuscator artifact/lib.js` (string arrays, control-flow flattening).
- **Bytecode**: `bytenode` compiles to `.jsc` loaded by a V8 `vm` — the reviewer uses
  `bytenode`/`v8` tooling or dynamic analysis.
- **Single binary**: Node SEA or `pkg`/`nexe` for a genuine ELF.

Verification target: run the driver (`docker compose exec app node driver.js ...`), or hit the
service if the library also exposes an HTTP shim.

### Native binary — reverse with IDA / Binary Ninja

Use when the user wants to find a bug in a compiled binary.

- **C/C++**: build with `-O2` and ship unstripped for `easy`/`medium` (`-g`), stripped for `hard`.
  Plant a memory-safety or logic flaw from the catalog.
  ```bash
  gcc -O2 -o artifact/app src/*.c          # medium
  gcc -O2 -s -o artifact/app src/*.c       # hard
  ```
- **Rust / Go**: `cargo build --release`; Go `-ldflags="-s -w"`. Go binaries keep rich metadata —
  good for medium.
- **Symbols**: for `easy`/`medium` keep a symbol for the vulnerable function; for `hard`, strip but
  leave distinctive strings/error messages.
- Ship a `driver` or CLI entry so the flaw is triggerable, and a `Dockerfile` so it runs anywhere.

Verification target: execute the binary in the container with the crafted input.

### JVM, Python, other

- **JVM**: build a jar without sources; optionally ProGuard for `hard`. Reviewer uses `jadx`/`cfr`.
- **Python**: PyInstaller / Nuitka / `pyarmor` to freeze a script into a native artifact.
- **.NET**: ship the assembly; reviewer uses `dnSpy`/`ILSpy`.

## What the reviewer should be able to do

The solution's Part 0 ("Reversing notes") must show how to go from artifact to finding **without
source**, for example:

1. `file`/`strings`/`nm` to orient, and `checksec` for the binary.
2. Open in IDA / Binary Ninja / Ghidra; find `main`, entry points, and the dangerous call
   (`strcpy`, `system`, `memcpy`, `eval`, `child_process`, `deserialize`, ...).
3. Reconstruct the relevant function and the input path to it.
4. Reproduce the flaw by running the artifact.
5. Only then apply the normal secure-code-review reasoning (source→sink reachability) to the recovered
   pseudo-source.

## Solution appendix

ZK solutions include two extra pieces (see `solution-schema.md`):

- **Part 0 — Reversing notes**: how the artifact was opened, what was recovered, and the recovered
  pseudo-source of the vulnerable function.
- **Source appendix**: the complete source used to build the artifact, fenced, at the end. This is
  what makes `vulnlab_reveal` a complete answer key and lets a future reader rebuild the challenge.

Keep the source out of the working tree even after sealing — the appendix lives only in the commit.
