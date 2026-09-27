# VulnLab — Secure Code Review Challenge Factory

A local, repeatable factory for **deliberately vulnerable applications** built for practising
**manual** secure code review and AppSec.

Every challenge is a complete, runnable application — not a snippet — containing a planted,
real-world-grounded vulnerability. You review it the way you would review a real service:
threat-model it, find the flaw, prove it is exploitable, and propose a fix. When you are ready, you
reveal the official solution and compare it against your own write-up.

There are two flavours:

- **Open source** — you get the full application and read it.
- **ZK (closed source)** — you get only a compiled or obfuscated artifact and recover the logic with
  IDA, Binary Ninja, Ghidra, or a deobfuscator before reviewing it.

The format is inspired by
[The Secure Code Review Challenge](https://github.com/mohamed-osama-aboelkheir/the-secure-code-review-challenge).

> ⚠️ **Every application under `challenges/` is intentionally vulnerable.** Run everything
> **locally, in isolation**, for learning only. Never deploy a challenge to a public,
> internet-facing, or production environment. Secrets in `.env.example` files are throwaway dev
> values — never reuse them.

---

## Contents

- [Requirements](#requirements)
- [Setup](#setup)
- [Quick start](#quick-start)
- [Challenge modes](#challenge-modes)
- [ZK mode (closed source)](#zk-mode-closed-source)
- [Archetypes](#archetypes)
- [Vulnerability coverage](#vulnerability-coverage)
- [Tool reference](#tool-reference)
- [How solutions are stored](#how-solutions-are-stored)
- [Review methodology](#review-methodology)
- [Repository layout](#repository-layout)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Requirements

| Tool | Why |
| --- | --- |
| `opencode` | Hosts the skill, plugin, and `/vulnlab` command |
| `bun` (or `npm`) | Installs the plugin's `@opencode/plugin` dependency |
| `git` | Solutions are stored in commit messages |
| `docker` + Compose | Runs challenges, and builds/verifies the planted flaw |
| a decompiler (optional) | IDA / Binary Ninja / Ghidra / jadx, for ZK challenges |

## Setup

```bash
./install.sh            # global: ~/.config/opencode (recommended)
./install.sh --local    # project-local: ./.opencode
```

The installer:

1. detects your OpenCode version and installs `@opencode/plugin` pinned to it,
2. symlinks the plugin, skill, and `/vulnlab` command into the config directory,
3. reloads OpenCode so they load immediately.

Re-run it after upgrading OpenCode. To remove the links (it never touches real directories or the
plugin source):

```bash
./uninstall.sh
```

Once installed, the factory is available in **any** project — `vulnlab_*` tools and the `vulnlab`
skill are global.

## Quick start

Generate a challenge:

```text
/vulnlab new name="Acme Notes" language=python archetype=web-app mode=single difficulty=medium
```

This creates `challenges/0001-acme-notes/` with a full application, Docker assets, a brief
`README.md`, and a public `challenge.json`. The planted vulnerability is described **only** in the
git commit message — never in the working tree.

Review it: read the app, record findings in your own copy of
[`SOLUTION_TEMPLATE.md`](SOLUTION_TEMPLATE.md), and try to exploit the flaw.

List and reveal:

```text
/vulnlab list
/vulnlab reveal 0001
```

`reveal` prints the official solution — Part I review steps (scope, entry points, sinks, threat
model, mitigation review) and Part II (finding, exploit, verified proof, impact, fix, CVE grounding).

## Challenge modes

Set `mode=` when generating:

| Mode | What you get |
| --- | --- |
| `single` *(default)* | Exactly one planted, CVE-grounded vulnerability, like the reference challenge series |
| `chain` | Several interacting flaws in one app |
| `novel` | At least one flaw that combines two primitives (e.g. TOCTOU + broken authorization, SSRF → metadata → credential reuse) |

Other knobs:

- `difficulty=` — `easy`, `medium`, `hard`, or `mixed`.
- `theme=` — a one-line premise so the flaw has a natural home.
- `docker=` — whether the challenge uses Docker infrastructure (default `true`).

Every planted flaw is required to be reachable from an external input (HTTP route, CLI argument, file
upload, network payload, or IPC), and every challenge is **verified by executing the exploit**
before the solution is sealed.

## ZK mode (closed source)

Add `zk=true` for a **reverse-engineering** challenge. The factory builds the app in a temporary
workspace, ships only the compiled/obfuscated artifact plus a runnable driver, and seals the source
inside the commit. You recover the logic yourself before the review begins.

```text
/vulnlab new name="TokenGuard" language=node archetype=library zk=true zkKind=js-bundle
/vulnlab new name="FleetAgent" language=cpp archetype=native-cli zk=true zkKind=native-binary difficulty=hard
```

| `zkKind` | Artifact | Typical tooling |
| --- | --- | --- |
| `js-bundle` | Bundled/minified (or obfuscated) JavaScript | deobfuscator, DevTools |
| `bytecode` | Node `bytenode` `.jsc` / V8 bytecode | `bytenode`, dynamic analysis |
| `native-binary` | Compiled C/C++/Rust/Go binary | IDA, Binary Ninja, Ghidra |
| `jvm` | Jar without sources (optionally ProGuard) | jadx, CFR |
| `python-frozen` | PyInstaller / Nuitka / pyarmor artifact | decompilers, dynamic analysis |
| `auto` | Chooses based on language | — |

In ZK mode the working tree contains **only** the artifact. The solution gains **Part 0 — Reversing
notes** (tooling, entry point, recovered pseudo-source) and a **source appendix** with the complete
source, so `vulnlab reveal` is a self-contained answer key. Challenges stay fair: strings, error
messages, or a symbol for non-planted functions are kept unless you ask for `difficulty=hard`.

## Archetypes

| Archetype | Shape | Fits |
| --- | --- | --- |
| `web-app` | Server-rendered pages + browser client | XSS, CSRF, SSTI, IDOR, business logic, uploads |
| `web-api` | JSON/REST or GraphQL | BOLA/IDOR, mass assignment, broken auth, SSRF, deserialization |
| `native-cli` | Argument parser + file/network inputs | memory safety, format strings, path traversal, TOCTOU |
| `native-gui` | Qt/GTK/Electron/Tauri | memory safety, insecure project-file parsing, IPC trust |
| `service-daemon` | Socket/RPC background service | protocol parsing, auth bypass, privilege assumptions |
| `library` | Package with an example consumer | unsafe defaults, crypto misuse, deserialization helpers |
| `ipc` | Producer/consumer over a queue or socket | cross-boundary trust, deserialization, missing authz |

Anything that needs infrastructure gets `Dockerfile` + `docker-compose.yml`, with the application
service named `app`, stock images for backends, loopback-only ports, a non-root app user, and
throwaway `.env.example` secrets.

## Vulnerability coverage

The catalog (`skill/vulnlab/references/vuln-catalog.md`) maps each class to CWEs, OWASP categories,
and real-world CVE seeds:

- **Race conditions & TOCTOU** — file check-then-use, symlink swap, DB check-then-act, double-spend.
- **Business logic** — mass assignment, IDOR, workflow bypass, price/quantity manipulation, coupon
  stacking, rate-limit and quota bypass.
- **Access control** — missing function-level authorization, privilege escalation, multi-tenant
  isolation failure, path traversal.
- **Injection & parsing** — SQL/NoSQL, command, template, XSS, XXE, deserialization, prototype
  pollution, header/log injection.
- **Memory safety** — buffer overflow, off-by-one, integer overflow, use-after-free, double-free,
  format string, uninitialized memory.
- **Cryptography** — ECB/static IV, weak RNG, hardcoded keys, timing-unsafe comparison, JWT
  confusion, disabled TLS verification.
- **Dependency / library misuse** — vulnerable pinned versions, dangerous APIs on request data
  (`pickle.loads`, `yaml.load`, `eval`, `shell=True`), and correctly-designed libraries misconfigured
  (XXE, JWT verification off, SSRF via a URL fetcher).
- **SSRF, request forgery & server-side trust** — SSRF to metadata, open redirect, CSRF, host-header
  and cache poisoning.
- **Novel / emergent** — deliberately combined primitives for `mode=novel`.

## Tool reference

The `vulnlab_*` tools are also callable directly by the agent.

### `vulnlab_scaffold`

Create a challenge skeleton and allocate the next id.

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | Product name, e.g. `FileDrop` |
| `language` | string | `python`, `node`, `go`, `cpp`, … |
| `archetype` | string | See [Archetypes](#archetypes) |
| `slug` | string | Optional; derived from `name` |
| `mode` | string | `single` \| `chain` \| `novel` |
| `difficulty` | string | `easy` \| `medium` \| `hard` \| `mixed` |
| `theme` | string | Optional premise |
| `docker` | boolean | Default `true` |
| `zk` | boolean | Closed-source reverse-engineering challenge |
| `zkKind` | string | `native-binary` \| `js-bundle` \| `bytecode` \| `jvm` \| `python-frozen` \| `auto` |

### `vulnlab_commit`

Commit a challenge with the full solution as the commit message body, updating the registry.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Challenge id, slug, or `NNNN-slug` |
| `solution` | string | Full Markdown solution (see `solution-schema.md`) |
| `subject` | string | Optional commit subject override |

### `vulnlab_list`

List every challenge with id, name, language, archetype, mode, difficulty, status, and verified flag.

### `vulnlab_reveal`

Print the sealed solution for a challenge. Use only when you explicitly want the answer.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Challenge id, slug, or `NNNN-slug` |

### `vulnlab_verify`

Build and run a challenge, execute the proof-of-concept, capture the proof, and record verification.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Challenge id, slug, or `NNNN-slug` |
| `build` | string[] | Host build/start commands; defaults to `docker compose up -d --build` when a compose file exists |
| `poc` | object[] | Ordered steps: `{ target: "host" \| "app", service?, cmd, expect? }` |
| `teardown` | boolean | Stop the stack afterwards (default `true`) |
| `timeoutMs` | integer | Per-command timeout (default `300000`) |

`expect` is a substring that must appear in the output for the step to pass. A challenge is only
considered verified once every step passes.

## How solutions are stored

The answer key for each challenge is the **commit message body** of that challenge's commit. The
working tree stays clean, so browsing `challenges/` never spoils the exercise.

```bash
git log --format='%H %s'          # list challenge commits
git show -s --format=%B <sha>     # read a solution directly
```

Accepted tradeoff: this is plaintext in `.git/`. It hides answers from casual browsing, not from a
determined reader. Do not run `git log` in a session where you intend to review a challenge blind.

## Review methodology

Record your findings in your private copy of [`SOLUTION_TEMPLATE.md`](SOLUTION_TEMPLATE.md):

1. 🗺️ Understand the application's scope & architecture
2. 🚪 Identify the entry points
3. 🎯 Identify dangerous sinks (code & dependencies)
4. 🧩 Build a threat model — business-logic (*should be there, isn't*) + source-to-sink
   (*shouldn't be there, could be*)
5. 🔍 Review the mitigations
6. 🧪 Exploit
7. 🛠️ Fix

Then compare with the official solution (step 8 of the template).

## Repository layout

```text
.
├── README.md                 # you are here
├── SOLUTION_TEMPLATE.md      # copy into your private notes per challenge
├── install.sh                # install the plugin/skill/command
├── uninstall.sh
├── plugin/vulnlab/           # plugin tools + bundled templates
│   ├── index.ts
│   ├── package.json
│   └── templates/
├── skill/vulnlab/            # generation methodology
│   ├── SKILL.md
│   └── references/
│       ├── vuln-catalog.md
│       ├── app-archetypes.md
│       ├── reverse-engineering.md
│       └── solution-schema.md
├── command/vulnlab.md        # /vulnlab command
├── challenges/
│   └── 0001-<slug>/          # a generated challenge
│       ├── README.md         # brief + how to run it (no hints)
│       ├── challenge.json    # public metadata only
│       ├── artifact/         # ZK mode: the compiled/obfuscated deliverable
│       └── ...               # application source + Docker assets
└── .vulnlab/registry.json    # factory index
```

## Troubleshooting

**`vulnlab` tools or skill not available.** Run `./install.sh` and then `opencode reload`. Check the
links exist with `ls -l ~/.config/opencode/plugins ~/.config/opencode/skills`.

**Plugin fails to load with `Cannot find package '@opencode/plugin'`.** The dependency is missing or
was pinned to a different OpenCode version. Re-run `./install.sh`; it re-pins to your current version.

**`docker compose up` fails or the app never becomes ready.** `vulnlab_verify` waits for the service
named `app`. Check the `Dockerfile`/`docker-compose.yml` and that `app` is the service name. The
verify result includes `docker compose logs --tail=80` when readiness fails.

**Version drift after upgrading OpenCode.** Re-run `./install.sh` so `@opencode/plugin` matches the
new CLI.

## License

MIT for the code. The intentional vulnerabilities are for education only.
