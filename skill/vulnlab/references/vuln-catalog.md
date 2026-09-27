# Vulnerability catalog

Pick the class from the target's nature, not from a list. For each planted flaw, record the CWE and
at least one real-world CVE or documented case. Prefer classes where finding the flaw requires real
reasoning (reachability, authorization model, state, economics) over a single obvious dangerous call.

Legend: **Reach** = how a human triggers it from outside. **Plausible-safety** = why the buggy code
looks fine at a glance (use this to guide decoys).

---

## 1. Race conditions & TOCTOU

- **TOCTOU — file** (`CWE-367`, `CWE-362`): check a path (`access`/`os.path.exists`/`stat`) then use
  it (`open`/`write`/`unlink`), with a window where the path is swapped (symlink, rename).
- **TOCTOU — authorization/data**: authorize a resource id, then fetch it by id later; the record can
  change between check and use (ownership transfer, role change, price update).
- **Double-spend / non-atomic balance**: read balance, validate, write new balance in two steps.
- **Check-then-act on stock/inventory/coupons**: total validated before a concurrent mutation.
- **Lock-free shared-state races** (C/C++/Go/Rust): data race, missing lock, `volatile` misuse.
- Real-world seeds: CVE-2021-4034 (pkexec, PwnKit TOCTOU), CVE-2019-13272 (Linux ptrace),
  Citibank/Fedwire-style double-spend, classic `access()`→`fopen()` patterns.
- **Plausible-safety**: code that reads cleanly with a guard clause; the window is only visible if you
  think about concurrency.

## 2. Business-logic

- **Mass assignment / over-binding**: `**request.json`, `obj.update(body)`, model binding sets
  privileged fields.
- **IDOR / missing object-level authorization** (`CWE-639`): fetch by id without an owner/tenant
  predicate; the lookup "looks" scoped.
- **Workflow / state-machine bypass**: skip a required step (payment, verification, approval) by
  calling a later endpoint directly.
- **Price / quantity / currency manipulation**: negative quantity, client-supplied price, rounding
  accumulation, refund more than paid, coupon stacking.
- **Rate-limit / quota bypass**: limit enforced per-session but not per-account, or only in the UI.
- **Trusting client-side validation**: server accepts what the UI would have blocked.
- Real-world seeds: e-commerce coupon stacking, airline frequent-flyer logic bugs, banking
  transfer-limit bypasses, `CWE-840`.
- **Plausible-safety**: every line is a valid, well-intentioned guard; the flaw is a *missing* rule,
  not a dangerous call.

## 3. Access control & authorization

- **Missing function-level authorization** (`CWE-862`): an admin action with only authentication.
- **Privilege escalation** (`CWE-269`): role taken from user-controlled input or JWT claim.
- **Multi-tenant isolation failure** (`CWE-639`, `CWE-566`): query filters by tenant in one path but
  not another.
- **Path traversal** (`CWE-22`): user-controlled path joined to a base without canonicalization.
- **Forced browsing / exposed debug**: unauthenticated internal endpoint.
- Real-world seeds: CVE-2024-* Uber/IDOR disclosures, CVE-2023-34362 (MOVEit), GraphQL BOLA patterns
  (OWASP API #1).
- **Plausible-safety**: authorization *is* present, but on the wrong object or after the side effect.

## 4. Injection & parsing

- **SQL/NoSQL injection** (`CWE-89`, `CWE-943`): string-built query, `$where`, operator injection
  (`{"$ne": null}`).
- **OS command injection** (`CWE-78`): `shell=True`, backticks, `system()`, `Runtime.exec`.
- **Template injection / SSTI** (`CWE-1336`): user input rendered by a template engine.
- **XSS** (`CWE-79`): stored/reflected, `innerHTML`, `dangerouslySetInnerHTML`, `|safe`.
- **XXE** (`CWE-611`): XML parser with external entities enabled.
- **Deserialization** (`CWE-502`): `pickle.loads`, `yaml.load`, Java `ObjectInputStream`,
  PHP `unserialize`, Ruby `Marshal`.
- **Prototype pollution** (JS), **header/CRLF injection**, **log injection**, **XPath/LDAP injection**.
- Real-world seeds: Log4Shell (CVE-2021-44228), CVE-2022-22965 (Spring4Shell),
  CVE-2021-3129 (Laravel Ignition), CVE-2024-2912 (BentoML pickle), MOVEit (CVE-2023-34362).
- **Plausible-safety**: the sink is a familiar API; seeing it requires tracing source→sink.

## 5. Memory safety (C / C++ / unsafe Rust / Go cgo)

- **Stack/heap buffer overflow** (`CWE-121`, `CWE-122`): `strcpy`, `gets`, `sprintf`, unchecked
  `read`/`memcpy`.
- **Off-by-one**, **integer overflow leading to under-allocation** (`CWE-190`, `CWE-787`).
- **Use-after-free / double-free** (`CWE-416`, `CWE-415`).
- **Format string** (`CWE-134`): `printf(user_input)`.
- **Uninitialized memory / uninitialized pointer** (`CWE-457`).
- **Type confusion**, **signed/unsigned mismatch** (`CWE-195`), **NULL deref**.
- Real-world seeds: CVE-2014-0160 (Heartbleed), CVE-2021-3156 (sudo Baron Samedit),
  CVE-2023-4863 (libwebp), CVE-2021-4034.
- **Plausible-safety**: idiomatic-looking pointer arithmetic and length handling; the bug is a
  boundary or lifetime assumption.

## 6. Cryptography

- **ECB mode / static IV** (`CWE-327`), **weak PRNG** (`CWE-338`), **hardcoded key** (`CWE-321`),
  **unsalted/unsalted-fast hash** (`CWE-916`), **timing-unsafe comparison** (`CWE-208`),
  **padding oracle**, **JWT `alg=none` / ignored signature** (`CWE-347`), **TLS verification off**
  (`CWE-295`).
- Real-world seeds: CVE-2016-0777 (OpenSSH roaming), JWT confusion attacks, POODLE/BEAST lineage.
- **Plausible-safety**: uses a crypto library correctly at the API level but configures it weakly.

## 7. Dependency / library misuse exploitable from outside

The class the user called out: a library used in a way that an outside request can turn into a
compromise. Three sub-types:

- **Vulnerable pinned version**: old `PyYAML`, `log4j`, `lodash`, `spring-core`, `minimist`,
  `requests`/`urllib3`, `golang.org/x/text`, OpenSSL, `libwebp`, `xz`/`liblzma` (CVE-2024-3094).
- **Dangerous API on request data**: `pickle.loads`, `yaml.load` (unsafe loader), `eval`,
  `Function()`, `subprocess(shell=True)`, `os.system`, `marshal`, `ObjectInputStream`,
  `unserialize`.
- **Safe library misconfigured**: XML parser with DTD/entities enabled, JWT verify disabled,
  `rejectUnauthorized: false`, URL fetcher without an allowlist (SSRF), ORM `raw()` with string
  interpolation, image/file processor following symlinks.
- Real-world seeds: Log4Shell, CVE-2022-1471 (SnakeYAML), CVE-2024-2912, CVE-2024-3094,
  CVE-2021-44228, CVE-2020-9484 (Tomcat session deserialization).
- **Plausible-safety**: the dependency is reputable and the call site is standard; the danger is in
  the data flow or the configuration.

## 8. SSRF, request forgery & server-side trust

- **SSRF** (`CWE-918`): fetch a user URL; reach `169.254.169.254`, internal services.
- **Open redirect** (`CWE-601`) feeding an auth flow.
- **CSRF** (`CWE-352`) on a mutating endpoint.
- **Host header / cache poisoning** (`CWE-444`, `CWE-345`).
- Real-world seeds: Capital One (CVE-2019-7306-era SSRF→metadata), CVE-2021-26855 (Exchange
  ProxyLogon).
- **Plausible-safety**: the request is server-initiated and looks harmless.

## 9. Novel / emergent

Required when `mode=novel`. Combine two primitives so neither alone is the bug, for example:

- TOCTOU on a file **plus** missing authorization → write into another tenant's directory.
- Business rule (free-tier quota) **plus** a race → unlimited quota.
- SSRF **plus** credential reuse → move from metadata to the datastore.
- Deserialization **plus** a cache layer → poison all users' sessions.
- Template injection **plus** a sandbox escape assumption.
- A correctly-behaving library used with a wrong trust assumption at the boundary.

Document precisely why the combination is required, and why each half alone is insufficient — that
is what makes it novel rather than a renamed classic.

## Choosing a class

- Web/API default: business logic, IDOR, SSRF, injection, dependency misuse.
- Native default: memory safety, TOCTOU, integer/boundary bugs, format strings.
- If the user names a class (TOCTOU, business logic, library misuse, novel), honour it.
- If none is named, choose one that makes reachability non-obvious, and state your choice only in the
  sealed solution.
