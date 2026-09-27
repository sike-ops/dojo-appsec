# Application archetypes

Each archetype defines the shape of the app, the entry points the reviewer will map, the Docker
setup, and the kinds of flaws that fit naturally. Pick one, then adapt.

The application service in `docker-compose.yml` must always be named **`app`** so
`vulnlab_verify` can target it by default.

---

## web-app (server-rendered + browser client)

- **Stacks**: Django, Flask, Rails, Laravel, Express + templates, Spring MVC + Thymeleaf, Go
  `html/template`.
- **Shape**: session or cookie auth, server-rendered pages, HTML forms, maybe a small JS layer.
- **Good flaws**: XSS, CSRF, SSTI, IDOR, business logic, session flaws, file upload handling.
- **Docker**: `app` builds from local `Dockerfile`; `db` stock image when stateful; publish
  `127.0.0.1:PORT`; run as non-root; `.env.example`.
- **Seed**: create demo/admin accounts on first boot; document them in the README.

## web-api (JSON/REST or GraphQL)

- **Stacks**: Express/Fastify/NestJS, FastAPI/Django REST, Spring Boot, Go chi/gin, GraphQL.
- **Shape**: token auth (JWT or opaque), JSON endpoints, roles, pagination, resource ids.
- **Good flaws**: BOLA/IDOR, mass assignment, broken auth, rate-limit bypass, deserialization,
  dependency misuse, SSRF in a "fetch URL/link preview" feature.
- **Docker**: `app` + `db`; document endpoints and seeded tokens in the README.

## native-cli

- **Stacks**: C, C++, Rust, Go, Python (no server).
- **Shape**: argument parser, subcommands, file/directory inputs, maybe a network mode.
- **Good flaws**: memory safety, format strings, path traversal, TOCTOU on files, integer overflow,
  command injection in a "run external tool" feature.
- **Docker**: minimal `Dockerfile` (build stage + slim runtime), `stdin_open`/`tty` optional; the
  reviewer runs `docker compose run --rm app <args>`.
- **Seed**: sample input files committed alongside the app.

## native-gui

- **Stacks**: Qt (C++/Python), GTK, Electron, Tauri.
- **Shape**: file open/save, preferences, a plugin or import feature, IPC to a helper.
- **Good flaws**: memory safety, insecure deserialization of project files, IPC trust, TOCTOU,
  dependency misuse.
- **Docker**: often impractical for a display; prefer `native-cli` unless the GUI is essential. If
  GUI is required, keep a headless/CLI mode the PoC can drive and run that under Docker.

## service-daemon

- **Stacks**: systemd-style daemons, Go/Python/Rust background services, RPC/Unix sockets.
- **Shape**: listens on a socket (TCP/Unix), accepts framed messages, parses a config, writes logs.
- **Good flaws**: memory safety, protocol parsing bugs, auth bypass on the socket, privilege
  assumptions, log injection, TOCTOU on config reload.
- **Docker**: `app` exposes the socket; PoC connects with `nc`/a script; use an isolated compose
  network for "internal" services (DB, cache) that must not be reachable from the host.

## library

- **Stacks**: a package meant to be imported/linked (C lib, Python package, npm package, Go module).
- **Shape**: public API, parser/serializer, a small example consumer app included for the reviewer.
- **Good flaws**: unsafe defaults, memory safety, deserialization helpers, crypto misuse, path
  handling.
- **Docker**: ship the example consumer as `app` so the challenge is runnable; include tests showing
  intended use.

## ipc (multi-process / message bus)

- **Stacks**: one producer + one consumer, a queue (RabbitMQ/Redis/Kafka) or Unix socket.
- **Shape**: two services, a shared protocol, trust between components.
- **Good flaws**: message trust (consumer trusts producer input), deserialization across the
  boundary, authz missing in one component, TOCTOU across processes.
- **Docker**: `app` + broker stock image on an isolated network; expose only what the reviewer needs.

---

## Docker conventions (all archetypes)

```yaml
services:
  app:
    build: .
    ports:
      - "127.0.0.1:3000:3000"     # loopback only
    env_file: .env
    depends_on: [db]
  db:
    image: postgres:16
    environment: { POSTGRES_PASSWORD: devpassword }
    # no host port publication unless the reviewer needs it
volumes:
  db-data:
```

- App service is always **`app`**.
- Loopback-only port publication.
- Non-root app user in the `Dockerfile`.
- `.env.example` committed; `.env` git-ignored.
- Seeded accounts/keys created on first boot and documented in the README.
- Health check so `vulnlab_verify` can wait for readiness.

## Non-Docker fallback

If an archetype genuinely cannot run in Docker (e.g. a GUI), document the native build/run command in
the README and pass explicit `build`/`poc` host commands to `vulnlab_verify`. Prefer Docker
everywhere else.

## ZK (closed-source) variants

Every archetype also has a closed-source form. Build the source outside the challenge, commit only
the artifact under `challenges/<id>/artifact/`, keep the source in the sealed commit, and ship a
runnable driver. Concrete recipes (esbuild/obfuscator/bytenode, gcc/rustc/go strip levels, jadx,
PyInstaller) are in [`reverse-engineering.md`](reverse-engineering.md).
