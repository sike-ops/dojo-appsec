import { promises as fsp } from "node:fs"
import { spawn } from "node:child_process"
import path from "node:path"
import { Plugin } from "@opencode/plugin"

/**
 * VulnLab Challenge Factory — lifecycle tool.
 *
 * Tools (namespace "vulnlab"):
 *   vulnlab_scaffold  allocate + create a challenge skeleton
 *   vulnlab_commit    commit the app with the sealed solution as the commit message body
 *   vulnlab_list      list challenges and status
 *   vulnlab_reveal    print a sealed solution
 *   vulnlab_verify    build/run the app and execute the PoC inside the container
 */

const COMPOSE_FILES = ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"]
const DEFAULT_APP_SERVICE = "app"
const DEFAULT_TIMEOUT = 300_000

/** Directory this plugin file lives in, so bundled templates resolve no matter which project is open. */
const PLUGIN_DIR =
  typeof (import.meta as { dir?: string }).dir === "string"
    ? (import.meta as { dir: string }).dir
    : decodeURIComponent(new URL(".", import.meta.url).pathname)

type RunResult = { code: number; stdout: string; stderr: string }

type Entry = {
  id: string
  slug: string
  name: string
  language: string
  archetype: string
  mode: string
  difficulty: string
  createdAt: string
  status: "scaffolded" | "committed" | "verified"
  verified?: boolean
  zk?: boolean
  zkKind?: string
  dir: string
  docker: boolean
}

type Registry = { version: number; challenges: Entry[] }

function pad(n: number): string {
  return String(n).padStart(4, "0")
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
  return slug || "challenge"
}

function ok(content: unknown): { content: string } {
  return { content: typeof content === "string" ? content : JSON.stringify(content, null, 2) }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fsp.access(p)
    return true
  } catch {
    return false
  }
}

async function run(
  command: string,
  args: string[],
  opts: { cwd: string; input?: string; timeoutMs?: number } = { cwd: process.cwd() },
): Promise<RunResult> {
  return await new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: opts.cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    let settled = false
    const finish = (code: number) => {
      if (settled) return
      settled = true
      resolve({ code, stdout, stderr })
    }
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL")
      } catch {}
      finish(124)
    }, opts.timeoutMs ?? DEFAULT_TIMEOUT)
    child.stdout?.on("data", (d) => (stdout += d.toString()))
    child.stderr?.on("data", (d) => (stderr += d.toString()))
    child.on("error", (e) => {
      clearTimeout(timer)
      stderr += String((e as Error)?.message ?? e)
      finish(127)
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      finish(code ?? 0)
    })
    if (opts.input !== undefined) child.stdin?.write(opts.input)
    child.stdin?.end()
  })
}

async function sh(command: string, cwd: string, timeoutMs = DEFAULT_TIMEOUT): Promise<RunResult> {
  return run("/bin/sh", ["-lc", command], { cwd, timeoutMs })
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function readRegistry(base: string): Promise<Registry> {
  const file = path.join(base, ".vulnlab", "registry.json")
  if (!(await exists(file))) return { version: 1, challenges: [] }
  try {
    const parsed = JSON.parse(await fsp.readFile(file, "utf8")) as Registry
    if (!parsed.challenges) parsed.challenges = []
    return parsed
  } catch {
    return { version: 1, challenges: [] }
  }
}

async function writeRegistry(base: string, registry: Registry): Promise<void> {
  const dir = path.join(base, ".vulnlab")
  await fsp.mkdir(dir, { recursive: true })
  await fsp.writeFile(path.join(dir, "registry.json"), JSON.stringify(registry, null, 2) + "\n")
}

function findEntry(registry: Registry, ref: string): Entry | undefined {
  const needle = String(ref ?? "").trim().toLowerCase()
  return registry.challenges.find(
    (c) => c.id.toLowerCase() === needle || c.slug.toLowerCase() === needle || `${c.id}-${c.slug}`.toLowerCase() === needle,
  )
}

async function ensureRepo(base: string): Promise<void> {
  const gitDir = path.join(base, ".git")
  if (!(await exists(gitDir))) {
    await run("git", ["init", "-q"], { cwd: base })
    const ignore = path.join(base, ".gitignore")
    if (!(await exists(ignore))) {
      await fsp.writeFile(
        ignore,
        "*.pdf\noutput.txt\n**/.env\n!**/.env.example\n**/node_modules/\n**/__pycache__/\n",
      )
    }
  }
}

async function gitIdentity(base: string): Promise<string[]> {
  const name = await run("git", ["config", "user.name"], { cwd: base })
  const email = await run("git", ["config", "user.email"], { cwd: base })
  const args: string[] = []
  if (!name.stdout.trim()) args.push("-c", "user.name=VulnLab Factory")
  if (!email.stdout.trim()) args.push("-c", "user.email=vulnlab@localhost")
  return args
}

async function readTemplate(file: string): Promise<string> {
  const p = path.join(PLUGIN_DIR, "templates", file)
  return await fsp.readFile(p, "utf8")
}

function render(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{([A-Z_]+)\}\}/g, (_m, key) => vars[key] ?? `{{${key}}}`)
}

async function detectCompose(dirAbs: string): Promise<string | undefined> {
  for (const f of COMPOSE_FILES) {
    if (await exists(path.join(dirAbs, f))) return f
  }
  return undefined
}

function truncate(text: string, max = 4000): string {
  if (text.length <= max) return text
  return text.slice(0, max) + `\n... [truncated ${text.length - max} chars]`
}

export default Plugin.define({
  id: "vulnlab",
  async setup(ctx) {
    const base = ctx.location.directory

    await ctx.tool.transform((editor) => {
      editor.namespace({
        name: "vulnlab",
        description: "Generate, verify, and reveal secure-code-review challenges",
      })

      editor.add({
        name: "scaffold",
        description:
          "Create a new deliberately-vulnerable challenge skeleton. Allocates the next id, creates challenges/NNNN-slug/ with a public challenge.json and a brief README, and records it in the registry. The vulnerability itself is never written here.",
        input: {
          type: "object",
          properties: {
            name: { type: "string", description: "Human product name, e.g. 'FileDrop'." },
            slug: { type: "string", description: "Optional url slug; derived from name if omitted." },
            language: { type: "string", description: "Primary language, e.g. python, node, go, cpp." },
            archetype: {
              type: "string",
              description: "web-app | web-api | native-cli | native-gui | service-daemon | library | ipc",
            },
            mode: { type: "string", enum: ["single", "chain", "novel"], description: "Default single." },
            difficulty: { type: "string", enum: ["easy", "medium", "hard", "mixed"], description: "Default medium." },
            theme: { type: "string", description: "Optional one-line premise." },
            docker: { type: "boolean", description: "Record that the challenge uses Docker infrastructure. Default true." },
            zk: {
              type: "boolean",
              description:
                "ZK (closed-source) mode: ship only a compiled/obfuscated artifact under artifact/. The source is sealed in the commit message and never written to the working tree, so the reviewer must reverse it.",
            },
            zkKind: {
              type: "string",
              enum: ["native-binary", "js-bundle", "bytecode", "jvm", "python-frozen", "auto"],
              description: "Artifact kind for ZK mode. Default auto.",
            },
          },
          required: ["name", "language", "archetype"],
          additionalProperties: false,
        },
        options: { namespace: "vulnlab", codemode: true },
        execute: async (raw, context) => {
          const input = raw as Record<string, unknown>
          await context.progress({ status: "scaffolding challenge" })
          await fsp.mkdir(path.join(base, ".vulnlab"), { recursive: true })
          await fsp.mkdir(path.join(base, "challenges"), { recursive: true })

          const registry = await readRegistry(base)
          const next = registry.challenges.reduce((max, c) => Math.max(max, Number(c.id) || 0), 0) + 1
          const id = pad(next)

          const name = String(input.name)
          let slug = input.slug ? slugify(String(input.slug)) : slugify(name)
          let dirRel = path.join("challenges", `${id}-${slug}`)
          let n = 2
          while (await exists(path.join(base, dirRel))) {
            dirRel = path.join("challenges", `${id}-${slug}-${n++}`)
          }
          const dirAbs = path.join(base, dirRel)
          await fsp.mkdir(dirAbs, { recursive: true })

          const language = String(input.language)
          const archetype = String(input.archetype)
          const mode = String(input.mode ?? "single")
          const difficulty = String(input.difficulty ?? "medium")
          const docker = input.docker === undefined ? true : Boolean(input.docker)
          const zk = Boolean(input.zk)
          const zkKind = zk ? String(input.zkKind ?? "auto") : undefined
          const createdAt = new Date().toISOString()
          const date = createdAt.slice(0, 10)

          const vars: Record<string, string> = {
            ID: id,
            SLUG: slug,
            NAME: name,
            LANGUAGE: language,
            ARCHETYPE: archetype,
            MODE: mode,
            DIFFICULTY: difficulty,
            DATE: date,
          }

          const readme = render(await readTemplate("challenge-README.md"), vars)
          await fsp.writeFile(path.join(dirAbs, "README.md"), readme)

          const meta = {
            id,
            slug,
            name,
            language,
            archetype,
            mode,
            difficulty,
            createdAt,
            status: "scaffolded",
            docker,
            zk,
            zkKind,
          }
          await fsp.writeFile(path.join(dirAbs, "challenge.json"), JSON.stringify(meta, null, 2) + "\n")

          const entry: Entry = {
            id,
            slug,
            name,
            language,
            archetype,
            mode,
            difficulty,
            createdAt,
            status: "scaffolded",
            dir: dirRel,
            docker,
            zk,
            zkKind,
          }
          registry.challenges.push(entry)
          await writeRegistry(base, registry)

          const result: Record<string, unknown> = {
            id,
            slug,
            dir: dirRel,
            absoluteDir: dirAbs,
            docker,
            zk,
          }
          if (zk) {
            result.zkKind = zkKind
            result.sourcePolicy =
              "ZK (closed-source) mode: build the artifact from a temporary source workspace outside the challenge directory, copy only the built artifact into " +
              path.join(dirRel, "artifact") +
              ", then delete the source workspace. The source goes into the sealed commit message (as a source appendix in the solution), never into the working tree."
            result.next =
              "Build the app and its artifact, ship only the artifact + run instructions, prove the flaw with vulnlab_verify, then seal the solution AND the full source with vulnlab_commit."
          } else {
            result.next =
              "Build the full app in this directory (Docker-first when it needs infrastructure), fill in README.md, then prove the flaw with vulnlab_verify and seal the solution with vulnlab_commit."
          }
          await context.progress({ status: `created ${dirRel}${zk ? " (ZK/closed-source)" : ""}` })
          return ok(result)
        },
      })

      editor.add({
        name: "commit",
        description:
          "Commit a challenge with its full solution stored as the commit message body (plaintext, out of the working tree). Updates the registry status to committed.",
        input: {
          type: "object",
          properties: {
            id: { type: "string", description: "Challenge id, slug, or NNNN-slug." },
            solution: {
              type: "string",
              description:
                "The full Markdown solution (Part I review steps + Part II finding), following references/solution-schema.md.",
            },
            subject: { type: "string", description: "Optional commit subject override." },
          },
          required: ["id", "solution"],
          additionalProperties: false,
        },
        options: { namespace: "vulnlab", codemode: true },
        execute: async (raw, context) => {
          const input = raw as Record<string, unknown>
          const registry = await readRegistry(base)
          const entry = findEntry(registry, String(input.id))
          if (!entry) return ok({ error: `No challenge matching '${input.id}'. Run vulnlab_list.` })

          const solution = String(input.solution)
          if (!solution.trim()) return ok({ error: "Solution is empty; refusing to commit a challenge with no sealed answer." })

          await ensureRepo(base)
          entry.status = "committed"
          await writeRegistry(base, registry)

          await context.progress({ status: "committing sealed challenge" })
          const add = await run("git", ["add", "--", entry.dir, ".vulnlab/registry.json", ".gitignore"], { cwd: base })
          if (add.code !== 0) return ok({ error: "git add failed", stderr: truncate(add.stderr) })

          const subject = String(input.subject ?? `challenge ${entry.id}: ${entry.name}`)
          const message = `${subject}\n\n${solution}\n`
          const idArgs = await gitIdentity(base)
          const commit = await run("git", [...idArgs, "commit", "-q", "-F", "-"], {
            cwd: base,
            input: message,
            timeoutMs: 60_000,
          })
          if (commit.code !== 0) {
            return ok({ error: "git commit failed", stderr: truncate(commit.stderr), stdout: truncate(commit.stdout) })
          }
          const head = await run("git", ["rev-parse", "HEAD"], { cwd: base })
          const sha = head.stdout.trim()

          return ok({
            id: entry.id,
            committed: true,
            commit: sha,
            subject,
            revealWith: `/vulnlab reveal ${entry.id}`,
          })
        },
      })

      editor.add({
        name: "list",
        description: "List every challenge in the registry with its status.",
        input: { type: "object", properties: {}, additionalProperties: false },
        options: { namespace: "vulnlab", codemode: true },
        execute: async () => {
          const registry = await readRegistry(base)
          if (registry.challenges.length === 0) return ok("No challenges yet. Generate one with /vulnlab new.")
          const rows = registry.challenges.map((c) => ({
            id: c.id,
            name: c.name,
            language: c.language,
            archetype: c.archetype,
            mode: c.mode,
            difficulty: c.difficulty,
            status: c.status,
            verified: c.verified ?? false,
            zk: c.zk ?? false,
            zkKind: c.zkKind,
            dir: c.dir,
          }))
          return ok({ count: rows.length, challenges: rows })
        },
      })

      editor.add({
        name: "reveal",
        description:
          "Print the sealed solution for a challenge from its commit message. Only use this when the user explicitly asks to reveal the answer.",
        input: {
          type: "object",
          properties: { id: { type: "string", description: "Challenge id, slug, or NNNN-slug." } },
          required: ["id"],
          additionalProperties: false,
        },
        options: { namespace: "vulnlab", codemode: true },
        execute: async (raw) => {
          const input = raw as Record<string, unknown>
          const registry = await readRegistry(base)
          const entry = findEntry(registry, String(input.id))
          if (!entry) return ok({ error: `No challenge matching '${input.id}'.` })

          await ensureRepo(base)
          const found = await run(
            "git",
            ["log", "--all", "--format=%H", "--fixed-strings", `--grep=challenge ${entry.id}:`, "-n", "1"],
            { cwd: base },
          )
          const sha = found.stdout.trim().split("\n")[0]
          if (!sha) return ok({ error: `No sealed solution found for ${entry.id}. Was it committed?` })

          const body = await run("git", ["show", "-s", "--format=%B", sha], { cwd: base })
          if (body.code !== 0) return ok({ error: "git show failed", stderr: truncate(body.stderr) })
          return ok(body.stdout.replace(/\s+$/, ""))
        },
      })

      editor.add({
        name: "verify",
        description:
          "Build and run a challenge, execute its proof-of-concept steps (host and/or inside the app container), capture the proof, and record verification. Docker compose stacks are started automatically; the app service is assumed to be named 'app'.",
        input: {
          type: "object",
          properties: {
            id: { type: "string", description: "Challenge id, slug, or NNNN-slug." },
            build: {
              type: "array",
              items: { type: "string" },
              description: "Optional host build/start commands. Defaults to 'docker compose up -d --build' when a compose file exists.",
            },
            poc: {
              type: "array",
              description: "Ordered proof steps.",
              items: {
                type: "object",
                properties: {
                  target: { type: "string", enum: ["host", "app"], description: "Where to run: host shell or inside the app container. Default app." },
                  service: { type: "string", description: "Compose service name when target=app. Default 'app'." },
                  cmd: { type: "string", description: "Shell command." },
                  expect: { type: "string", description: "Substring that must appear in the output for the step to pass." },
                },
                required: ["cmd"],
                additionalProperties: false,
              },
            },
            teardown: { type: "boolean", description: "Stop the stack afterwards. Default true." },
            timeoutMs: { type: "integer", description: "Per-command timeout in ms. Default 300000." },
          },
          required: ["id", "poc"],
          additionalProperties: false,
        },
        options: { namespace: "vulnlab", codemode: true },
        execute: async (raw, context) => {
          const input = raw as Record<string, unknown>
          const registry = await readRegistry(base)
          const entry = findEntry(registry, String(input.id))
          if (!entry) return ok({ error: `No challenge matching '${input.id}'.` })

          const dirAbs = path.join(base, entry.dir)
          if (!(await exists(dirAbs))) return ok({ error: `Challenge directory missing: ${entry.dir}` })

          const timeoutMs = Number(input.timeoutMs ?? DEFAULT_TIMEOUT)
          const compose = await detectCompose(dirAbs)
          const teardown = input.teardown !== false
          const results: Array<Record<string, unknown>> = []

          // Build / start
          const buildCommands =
            Array.isArray(input.build) && input.build.length > 0
              ? (input.build as string[])
              : compose
                ? ["docker compose up -d --build"]
                : []
          for (const cmd of buildCommands) {
            await context.progress({ status: `build: ${cmd}` })
            const r = await sh(cmd, dirAbs, Math.max(timeoutMs, 600_000))
            results.push({ phase: "build", cmd, code: r.code, stdout: truncate(r.stdout), stderr: truncate(r.stderr) })
            if (r.code !== 0) {
              return ok({ id: entry.id, verified: false, failedAt: "build", results })
            }
          }

          // Wait for the app to answer
          if (compose) {
            const service = String((input.poc as any[]).find?.((p) => p?.service)?.service ?? DEFAULT_APP_SERVICE)
            let ready = false
            for (let i = 0; i < 45; i++) {
              const probe = await run("docker", ["compose", "exec", "-T", service, "true"], { cwd: dirAbs, timeoutMs: 15_000 })
              if (probe.code === 0) {
                ready = true
                break
              }
              await sleep(1000)
            }
            results.push({ phase: "ready", service, ready })
            if (!ready) {
              const logs = await sh("docker compose logs --tail=80", dirAbs, 60_000)
              if (teardown) await sh("docker compose down -v", dirAbs, 120_000)
              return ok({
                id: entry.id,
                verified: false,
                failedAt: "ready",
                hint: "app service did not become executable; check the service name and Dockerfile",
                logs: truncate(logs.stdout + logs.stderr),
                results,
              })
            }
          }

          // Proof steps
          let allOk = true
          for (const step of input.poc as Array<Record<string, unknown>>) {
            const cmd = String(step.cmd)
            const target = String(step.target ?? (compose ? "app" : "host"))
            const service = String(step.service ?? DEFAULT_APP_SERVICE)
            let r: RunResult
            if (target === "app" && compose) {
              r = await run("docker", ["compose", "exec", "-T", service, "sh", "-lc", cmd], { cwd: dirAbs, timeoutMs })
            } else {
              r = await sh(cmd, dirAbs, timeoutMs)
            }
            const combined = r.stdout + r.stderr
            const passed = step.expect !== undefined ? combined.includes(String(step.expect)) : r.code === 0
            if (!passed) allOk = false
            results.push({
              phase: "poc",
              target,
              cmd,
              code: r.code,
              passed,
              stdout: truncate(r.stdout),
              stderr: truncate(r.stderr),
            })
          }

          if (compose && teardown) {
            await context.progress({ status: "tearing down" })
            const down = await sh("docker compose down -v", dirAbs, 120_000)
            results.push({ phase: "teardown", code: down.code })
          }

          if (allOk) {
            entry.status = "verified"
            entry.verified = true
            await writeRegistry(base, registry)
          }

          return ok({
            id: entry.id,
            verified: allOk,
            proof: allOk
              ? "All PoC steps passed. The planted flaw is reachable and exploitable; seal it with vulnlab_commit."
              : "One or more PoC steps failed. The flaw is not demonstrably exploitable yet — fix the app and re-run.",
            results,
          })
        },
      })
    })
  },
})
