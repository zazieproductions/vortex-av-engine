# ADR-0004 — Deferred modulation routing layer

- **Status:** Proposed
- **Scope:** `assets/js/app.js` — mapping logic in `animate()`, `#mod-matrix` handlers
- **Related:** [architecture.md §9](../architecture.md#9-extension-seam)

## Context

The interface presents a 32-cell modulation matrix — the visual centrepiece of the workstation
metaphor and the element that most strongly signals "modular instrument." Its current implementation
toggles a CSS class and perturbs `params.speed` to a random value:

```js
cell.onclick = () => {
    cell.classList.toggle('active');
    params.speed = Math.random() * 2 + 0.5;
    …
};
```

Meanwhile the actual audio-to-visual mapping is hard-coded inline in `animate()`: `bassFreq` scales
the core, `midFreq` displaces the mesh, `highFreq` gates the particles. Adding a fourth source (MIDI
CC, an LFO, an envelope follower, a sensor) means editing the render loop and touching every mapping
site. The matrix and the mapping are entirely disconnected: the interface promises routing that the
engine does not implement.

This is an honest gap, documented as such in the README's limitations section. The question is
whether to close it now.

## Decision

**Defer.** Keep the matrix as an interface study for this iteration and record the intended design so
that the eventual implementation is a planned migration rather than a rewrite.

The reasoning is about ordering. A routing layer is only worth building once there is something to
route. Today there are three sources and four sinks, all fixed — a routing graph over that is
strictly more machinery for identical behaviour. The layer becomes load-bearing at the moment a
second *class* of source appears (MIDI, LFO, sensor), because that is when the alternative is
combinatorial edits to the render loop. Building it before then would mean designing the abstraction
against a single known use case, which is how abstractions acquire the wrong shape.

The cost of deferring is one honest disclosure in the README, which is already there. The cost of
building prematurely is an abstraction that has to be redesigned when the real requirements arrive.

## Proposed design

Interpose a routing stage between analysis and rendering:

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   SOURCES   │────▶│    MATRIX    │────▶│    SINKS    │
├─────────────┤     ├──────────────┤     ├─────────────┤
│ bass        │     │ sparse edges │     │ coreScale   │
│ mid         │     │ each with:   │     │ meshDisplace│
│ high        │     │  · gain      │     │ particleGate│
│ rms         │     │  · curve     │     │ hueRate     │
│ centroid    │     │  · offset    │     │ rotationRate│
│ lfo[n]      │     │  · slew      │     │ fogDensity  │
│ envelope[n] │     │              │     │ cameraShake │
│ midiCC[n]   │     │              │     │ …           │
└─────────────┘     └──────────────┘     └─────────────┘
```

Sources publish normalised values in `[0, 1]` each frame into a named registry. Sinks declare a name,
a default, and a range. The matrix holds a sparse edge list; each edge applies gain, an optional
response curve (linear / exponential / logarithmic / S-curve), an offset, and a slew limit. Sinks
sum their incoming edges and clamp to range.

Normalising every source to `[0, 1]` at the boundary is what makes arbitrary cross-connection
meaningful — any source can drive any sink without per-pair scale factors, which is precisely the
property the current hard-coded mapping lacks.

Sketch:

```js
const sources = { bass: 0, mid: 0, high: 0, rms: 0 };          // written each frame
const sinks   = { coreScale: 1, meshDisplace: 0, hueRate: 0 }; // read by the renderer

const edges = [
  { from: 'bass', to: 'coreScale',    gain: 2.0, curve: 'lin' },
  { from: 'mid',  to: 'meshDisplace', gain: 5.1, curve: 'exp' },
];

function resolveRouting() {
  for (const k in sinks) sinks[k] = defaults[k];
  for (const e of edges) sinks[e.to] += applyCurve(sources[e.from], e.curve) * e.gain;
}
```

The 32 matrix cells then map to a source × sink grid, and toggling a cell adds or removes an edge —
making the interface literally true.

## Consequences

**If implemented:**

- The matrix becomes functional rather than decorative, closing the gap between interface claim and
  engine behaviour.
- MIDI, OSC, and sensor input become additive: register a source, done. No render-loop edits.
- Presets become trivially serialisable — the edge list *is* the patch.
- Costs one indirection per edge per frame (negligible at this scale) and a real UI for editing
  per-edge gain and curve, which is the larger part of the work.
- Per-band response curves would subsume the perceptual-weighting question deferred from
  [ADR-0002](0002-proportional-band-split.md).

**While deferred:**

- The matrix remains, and must be described as, an interface study.
- Each new source requires touching the render loop directly.

## Alternatives considered

**A full node graph with arbitrary intermediate processing** (math nodes, sample-and-hold,
quantisers). More expressive and closer to real modular systems. Rejected as scope: a matrix is a
constrained node graph, and the constraint is what keeps the UI to a single readable grid.

**Per-sink callback registration** — each sink subscribes to a source directly. Simpler, but pushes
routing state into closures where it cannot be serialised as a preset or displayed in the matrix UI.

## Revisiting

Implement when the first of these lands: MIDI input, preset save/load, LFOs or envelope followers, or
external control via OSC/WebSocket. Any one of them makes the routing layer cheaper to build than to
work around.
