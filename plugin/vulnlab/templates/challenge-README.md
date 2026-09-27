# Secure Code Review Challenge {{ID}}: {{NAME}}

<!-- Replace every {{PLACEHOLDER}} and TODO below. The brief must contain NO hint about the
     planted vulnerability. -->

**{{NAME}}** — <!-- one-line pitch: what it is and who uses it. -->

<!-- Then a short paragraph in the reviewer's voice: what the app is for, what it should protect,
     and the mission ("find the one flaw that breaks that model"). -->

---

## The application

<!-- Describe the app: roles, core features, auth mechanism, datastore, frontend/backend split,
     packaging. Mention that the full source is in this directory and is a complete, working
     application. -->

- **Users** ...
- **Authentication** ...
- **Datastore** ...
- **Stack** ...
- **Packaging** ...

The full source is in this directory. It is complete and working — not a snippet. Read all of it,
including its dependencies.

## Your mission

1. **Threat-model first.** Map the system before reading line by line.
2. **Identify** the planted vulnerability.
3. **Exploit** it to prove the impact.
4. **Fix** it — a primary fix plus any defense-in-depth.

Record your findings in your own copy of [`../../SOLUTION_TEMPLATE.md`](../../SOLUTION_TEMPLATE.md).

## Running the application

<!-- Replace with the real commands. Docker example below. -->

<!-- ZK / closed-source: state that only a compiled artifact is provided under artifact/ and that
     the source is not included. Still document how to run the artifact. Remove this note otherwise. -->

```bash
cd challenges/{{ID}}-{{SLUG}}
cp .env.example .env        # throwaway dev secrets — never reuse them
docker compose up --build
```

- App: <http://127.0.0.1:{{PORT}}/>
- <!-- other surfaces: API base, health check, DB port -->

**Seeded accounts** (created on first boot):

| Username | Password |
| --- | --- |
| `demo` | `demo12345` |

Stop it with `docker compose down` (add `-v` to drop volumes).

> ⚠️ This app is **deliberately vulnerable**. Run it locally only — never expose it to a network you
> don't fully control. The `.env.example` holds throwaway dev secrets; never reuse them.

## Normal usage

<!-- Show how a legitimate user drives the app: UI steps and/or example API calls. Give enough that
     the reviewer can reach every feature. -->

## Reference

<!-- API endpoints, CLI subcommands, or protocol messages. Include routes the reviewer might miss. -->

## Record your solution

Work through the challenge and fill in your private copy of
[`../../SOLUTION_TEMPLATE.md`](../../SOLUTION_TEMPLATE.md). Do not post spoilers.
