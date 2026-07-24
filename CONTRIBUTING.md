# Contributing

Contributions that strengthen VORTEX as an audiovisual instrument are welcome.

Before changing anything substantial, read [`docs/README.md`](docs/README.md) — particularly
[architecture.md](docs/architecture.md) for the runtime model and the
[ADRs](docs/adr/README.md) for decisions that have already been weighed. Several apparent
"obvious improvements" are documented trade-offs with recorded reasoning; if you disagree with one,
say so in the ADR's terms rather than reverting it silently.

## Development

No build step. Run a static server from the repository root:

```bash
python3 -m http.server 8000   # or: npm start
```

Then visit `http://localhost:8000`.

Serve over HTTP rather than opening `index.html` directly — microphone capture requires a secure
context (`https://` or `localhost`) and will fail under `file://`.

## Project shape

Three files carry the entire application:

| File | Contents |
| --- | --- |
| `index.html` | Markup, CDN script tags, all DOM IDs the runtime binds to |
| `assets/css/styles.css` | Custom CSS on top of Tailwind utilities — CRT overlay, panels, matrix grid |
| `assets/js/app.js` | The whole runtime, in six ordered sections (state, UI, audio, mic, synth, visuals) |

`app.js` is a classic script in global scope with no module system. This is deliberate
([ADR-0003](docs/adr/0003-cdn-dependencies.md)) — please don't introduce a bundler, a package
manager dependency, or a build step without opening a discussion first.

## High-value contribution areas

Roughly in order of impact. The near-term items in the README's roadmap are all small, well-specified
changes with documented designs — good first contributions.

- **Performance** — GPU vertex displacement ([ADR-0001](docs/adr/0001-cpu-vertex-morph.md)) is the
  single largest available win. See [performance.md](docs/performance.md) for the profiling method
  and the tuning ladder.
- **Signal routing** — the modulation matrix is currently an interface study; the intended design is
  specified in [ADR-0004](docs/adr/0004-modulation-routing-layer.md).
- **Analysis** — perceptually-spaced bands, onset detection, spectral centroid as an additional
  source ([ADR-0002](docs/adr/0002-proportional-band-split.md)).
- **Accessibility** — `prefers-reduced-motion` support, keyboard control of the transport, focus
  states on the matrix cells. Currently the weakest area of the project.
- **Input** — Web MIDI, OSC/WebSocket, gamepad.
- **Rendering** — post-processing, alternative geometries, shader-based particle behaviour.
- **Export** — `MediaRecorder` capture of the canvas stream.
- **Responsive layout** — the dense workstation grid is desktop-first and degrades poorly.

## Code conventions

- **Match the surrounding style.** Four-space indent, semicolons, `const`/`let`, no semicolon-free
  or arrow-everything rewrites of existing code.
- **Keep `app.js` sectioned.** New code belongs in the relevant banner-commented section, or gets a
  new one.
- **Nothing allocates in the render loop.** `animate()` and everything it calls should reuse hoisted
  scratch objects. The one existing violation is documented in
  [ADR-0005](docs/adr/0005-per-frame-typed-array-allocation.md) — please don't add more.
- **Route teardown through `stopAllSources()`.** Any new audio node, stream, or timer must be
  released there. It has to stay safe to call from any state and re-entrantly.
- **Branch on `state.sourceType`**, not on node presence, when distinguishing file / mic / synth.
- **Use the right clock.** `audioContext.currentTime` for anything that must line up with audio;
  `Date.now()` for purely decorative motion.
- **Guard `stop()` and `disconnect()`** in try/catch — Web Audio throws on nodes that were never
  started.
- **No layout reads in the loop.** Avoid `offsetWidth`, `getBoundingClientRect`, and friends inside
  `animate()`; they force synchronous layout.

## Testing changes

There is no automated test suite. Verify manually across all three transports, since they share the
analyser and it is easy to break one while fixing another:

1. **File** — load, play, pause, resume, stop, and let a track end naturally (the `onended` path).
2. **Microphone** — grant access, confirm visuals react, and **confirm no acoustic feedback with
   speakers on**. This interlock is easy to break; see
   [architecture.md §6](docs/architecture.md#6-acoustic-feedback-interlock).
3. **Synth** — start, adjust both oscillator sliders while running, stop.
4. **Mode switching** — jump between all three in every order; nothing should leak, double up, or
   keep the microphone indicator lit.
5. **Resize** — including across displays of different pixel density.
6. **Cold load** — hard reload and confirm the scene animates before any audio exists.

For performance-affecting changes, include before/after frame times and the hardware you measured
on. [performance.md §7](docs/performance.md#7-profiling-recipes) has console recipes that require no
code changes.

## Pull requests

- Keep changes focused; one concern per PR.
- **Explain any change to the audio-to-visual mapping** and why it improves the response. Include a
  clip or a description of the material you tested against — mappings tuned only on four-on-the-floor
  content tend to fail on sparse or acoustic material.
- Update the relevant document in `docs/` alongside the code. Documentation that has drifted from
  the implementation is worse than none.
- **Add an ADR** for decisions that constrain future work: new dependencies, a build step, changing
  the analysis model, or altering the state contract. Copy the structure of an existing record —
  Context → Decision → Consequences → Alternatives considered — and keep it to one page.
- Note any new browser API and its support baseline.

## Reporting issues

Include the browser and version, the OS, whether the input was file / microphone / synth, and — for
visual or timing problems — the audio material's rough character (dense, sparse, bass-heavy, quiet).
Band response is material-dependent, so "the particles never move" is usually a question about
spectral content rather than a rendering bug.
