# Solution schema

The sealed solution is the commit message body for the challenge. It must follow this structure so
the reviewer can compare their own write-up to it field by field. Write it in Markdown. No scanner
output.

---

# Secure Code Review — Challenge #NNNN: <Name> — Solution

## Part 0: Reversing notes

*ZK (closed-source) challenges only; omit this part for open-source challenges.*

- **Artifact:** what was shipped and its format (ELF, minified JS bundle, jar, frozen Python).
- **Tooling:** IDA Pro / Binary Ninja / Ghidra / jadx / a JS deobfuscator, and why.
- **Orientation:** `file`, `strings`, `nm`, `checksec`, dependency list — what they revealed.
- **Entry point:** how the input path into the vulnerable function was located without source.
- **Recovered pseudo-source:** the decompiled vulnerable function, annotated.

## Part I: Review steps

*The methodology used to build a mental model before looking for the flaw: scope → entry points →
sinks → threat model → mitigation review.*

### 1. 🗺️ Application scope & architecture

- What the app does, its assets, and its roles.
- Tech stack: language, framework, datastore, auth mechanism.
- How components fit together: startup/wiring and the main request or execution flow.
- Link the files that matter with `file:line`.

### 2. 🚪 Entry points

A table of every place untrusted input enters, with the auth/role required.

| Entry point | Method | Auth / role | Notes |
| --- | --- | --- | --- |
| ... | ... | ... | ... |

### 3. 🎯 Dangerous sinks (code & dependencies)

Where user input could change behavior or cause harm. For each sink give `file:line` and the class it
would belong to. Include sinks that turn out to be **safe** — the reviewer needs to see why they do
not apply.

### 4 & 5. 🧩 Threat model & 🔍 mitigation review

Apply both categories and check every candidate class, not just the planted one:

- **🔓 Business logic** — things that *should* be there but are missing, checked at every entry point.
- **💉 Source-to-sink** — things that *shouldn't* be there but could be, checked at every sink.

For each candidate, state **mitigated / not mitigated**, and how and where (`file:line`). Mark things
that only *look* mitigated.

## Part II: The finding

### 6. 🧪 The vulnerability & exploitation

- **Class:** name → [CWE-XXX](https://cwe.mitre.org/...) (OWASP mapping).
- **Root cause:** the precise mistake, with `file:line`.
- **Sink:** the exact call, with `file:line`.
- **Why it works:** the mechanism, explained so a reader can reproduce the reasoning. Include the
  *"why it looks safe"* analysis — what makes the code appear correct.
- **Why the plausible alternatives don't fit:** the other candidate classes and the specific
  mitigation that rules each out.
- **Exploitation steps / PoC:** exact commands, payloads, or inputs.
- **Verified proof:** the observable output captured from a real run (see below).
- **Impact:** what an attacker gains, and how severe.

### 7. 🛠️ Suggested fix

- **Primary fix:** the correct change, shown as a code diff where practical.
- **Defense-in-depth:** additional controls (validation, least privilege, isolation, monitoring).
- Note why each fix is sufficient and what it does not cover.

### 8. 🌍 Real-world grounding & resources

- The lesson in one or two sentences.
- CWE and OWASP references.
- Authoritative docs/guidance links.
- A hands-on reference (e.g. PortSwigger Academy topic).
- At least one **real-world CVE** with the same root cause.
- A short takeaway heuristic for spotting this class next time.

## Source appendix (ZK / closed-source only)

Append the **complete source** used to build the artifact, in fenced blocks, after the grounding
section. This is the only copy — it makes `vulnlab_reveal` a complete answer key and lets a future
reader rebuild the challenge. Keep it out of the working tree.

```text
<!-- one fenced block per file, with the path as a heading -->
```

---

## Verified proof format

The proof must come from an executed run, not from reasoning. Capture the exact observable result:

```text
$ <the PoC command>
<the exact output showing the effect>

✅ Verified: <what was observed> — <what capability it demonstrates>.
```

For a command-execution flaw, show the created file or marker. For data access, show the returned
record. For a state change, show before/after.

## Writing rules

- Reference real files and line numbers; keep them accurate.
- Never invent a CVE. If unsure of an identifier, cite the documented class instead.
- No SAST/scanner output, no "a scanner would flag this" shortcuts.
- Keep the challenge brief (in `challenges/**`) free of all of the above.
