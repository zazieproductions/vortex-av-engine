# VORTEX — Technical Documentation

Engineering reference for the VORTEX audio-reactive WebGL instrument.

The application is three static files — `index.html`, `assets/css/styles.css`, `assets/js/app.js` —
with no build step. These documents describe how the audio analysis, synthesis, and rendering
subsystems inside them actually work, and record the reasoning behind the decisions that shaped
them.

---

## Reading order

**If you want to understand the system:**

1. [architecture.md](architecture.md) — runtime topology, module map, state contract, frame pipeline
2. [signal-flow.md](signal-flow.md) — Web Audio graph, FFT configuration, band-reduction mathematics
3. [render-pipeline.md](render-pipeline.md) — scene graph, vertex morph model, particle integration

**If you want to modify it:**

4. [api-reference.md](api-reference.md) — every internal function, plus console recipes for live tuning
5. [performance.md](performance.md) — frame budget, hot paths, profiling, low-end tuning ladder
6. [synthesis-engine.md](synthesis-engine.md) — lookahead scheduler, sequence structure, voice designs

**If you want to know why it is built this way:**

7. [adr/](adr/README.md) — architecture decision records

---

## Document summary

| Document | Covers |
| --- | --- |
| [architecture.md](architecture.md) | Design constraints, node topology, `state`/`params` contracts, per-frame execution order, teardown funnel, feedback interlock, extension seam |
| [signal-flow.md](signal-flow.md) | Node graphs per source type, FFT resolution and smoothing math, band boundaries in Hz, transfer functions, latency budget, privacy properties |
| [render-pipeline.md](render-pipeline.md) | Scene graph, geometry budget, vertex displacement derivation, particle dispersion model, fog and colour systems, tuning constants |
| [synthesis-engine.md](synthesis-engine.md) | Lookahead scheduling rationale, 64-step sequence and harmony, four voice designs with full envelope tables |
| [api-reference.md](api-reference.md) | Function-by-function reference with signatures, side effects, and preconditions; DevTools recipes |
| [performance.md](performance.md) | Frame budget breakdown, dominant hot path analysis, allocation pressure, profiling recipes, tuning ladder |
| [adr/](adr/README.md) | Five decision records: CPU morphing, band split, CDN dependencies, routing layer, allocation |

---

## Key technical facts

| Property | Value |
| --- | --- |
| FFT size / bins | 2048 / 1024 |
| Bin width @ 48 kHz | 23.44 Hz |
| Analyser smoothing | τ = 0.85 (~100 ms time constant) |
| Band boundaries @ 48 kHz | bass 0–234 Hz · mid 234 Hz–2.39 kHz · high 2.39–24 kHz |
| Morphed mesh vertices | 15 360 (icosahedron, detail 4, non-indexed) |
| Particle count | 4000 |
| Sequencer resolution | 16th notes at 120 BPM (125 ms/step), 64-step loop |
| Scheduler lookahead | 100 ms horizon, 25 ms timer |
| Frame budget | 16.67 ms target; ~7–11 ms typical on integrated graphics |
| Audio→visual latency | ~50–150 ms |
| Runtime dependencies | Three.js r128, Tailwind CSS (CDN), no build step |

---

## Conventions

- Code references cite file and function, e.g. `app.js › animate()`.
- Frequencies are given at 48 kHz unless stated; 44.1 kHz values are noted where they differ
  materially.
- ADRs are immutable once accepted. A reversed decision gets a new superseding record rather than
  an edit.
- Known limitations are stated in the document covering the relevant subsystem rather than collected
  in one place, so that anyone reading about a mechanism also reads about its failure modes.
