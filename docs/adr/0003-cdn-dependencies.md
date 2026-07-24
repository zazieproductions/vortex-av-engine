# ADR-0003 — CDN-hosted dependencies and no build step

- **Status:** Accepted
- **Scope:** `index.html`, `package.json`, `.github/workflows/static.yml`

## Context

VORTEX depends on Three.js (r128), Tailwind CSS, and two Google Fonts. It ships as three static files
deployed to GitHub Pages by a workflow that uploads the repository root verbatim.

The conventional approach — npm dependencies, a bundler, a `dist/` output — was weighed against
loading everything from CDNs with no build step at all.

## Decision

Load all third-party code from CDNs and ship no build pipeline. `package.json` declares no
dependencies; its only script starts a static file server.

The governing constraint is that **the artifact must remain openable**. `index.html` in a browser is
the whole application. Anyone can clone the repository and read the entire system — markup, styles,
and logic — with no toolchain, no install step, and no generated code standing between the source
and what runs. For a project whose value is partly pedagogical, a build step that transforms the
source into something unreadable is a real cost, not a neutral convention.

This also makes the deployment story trivial: the Pages workflow uploads `.` and is done. There is no
build cache to warm, no lockfile to drift, no Node version to pin, and no class of failure where the
deployed artifact differs from what a contributor sees locally. The repository *is* the deployment.

Tailwind's CDN build compiles utility classes in the browser at runtime, which is explicitly not
recommended for production — but "production" here is a single static page whose entire interface is
hand-authored, and the alternative is introducing the exact toolchain this decision exists to avoid.

## Consequences

**Accepted:**

- **Network dependency at load.** The page will not render correctly offline or if a CDN is
  unreachable. There is no local fallback.
- **Supply-chain surface.** Three CDN origins execute code with full page privileges. No Subresource
  Integrity hashes are currently specified — the clearest available hardening, and worth adding.
- **Tailwind runtime compilation** costs a few hundred milliseconds at startup and ships the full
  engine rather than a tree-shaken stylesheet.
- **Pinned to Three.js r128** by URL. Upgrading means editing a script tag and re-testing manually;
  there is no lockfile and no dependency automation.
- **Three outbound requests at load**, which is the page's only network activity — worth stating
  plainly given the project's privacy claims about audio (see
  [signal-flow.md §7](../signal-flow.md#7-privacy-properties)).

**Gained:**

- Clone and open. No install, no build, no Node requirement.
- Deployment is a file copy; the workflow has no build step to fail.
- The source that runs is the source in the repository, byte for byte.
- Zero maintenance surface from bundler configuration, transpiler targets, or lockfile churn.

## Alternatives considered

**Vendored dependencies committed to the repository.** Removes the network dependency and the
supply-chain risk while keeping the no-build property. The strongest alternative, and the likely next
step: it costs roughly 600 KB of committed minified library code and a manual update process. Not
adopted yet only because CDN caching genuinely benefits first-load time for a page shared as a link.

**npm plus a bundler (Vite/esbuild).** Standard, gives tree-shaking, a real Tailwind build, and
dependency pinning via lockfile. Rejected because it makes the repository unreadable without a
toolchain and introduces a build/deploy divergence class of bug, for a three-file application.

**ES modules with import maps.** Modern, no bundler, browser-native — and would allow
`three/addons` imports. Genuinely attractive; deferred because r128 predates the addons module layout
and migrating would mean an untested version jump alongside an unrelated architectural change.

## Revisiting

Two triggers should reopen this. First, **adding Subresource Integrity attributes** is worth doing
regardless of the rest — it closes the supply-chain gap for the cost of three hashes. Second, if the
project ever needs post-processing (`EffectComposer` and friends live in `three/addons`), the module
layout will force a Three.js upgrade, at which point import maps or vendoring should be adopted
together with it.
