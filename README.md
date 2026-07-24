# VORTEX // Audio-Reactive WebGL Instrument
<p align="center">
  <a href="https://zazieproductions.github.io/vortex-av-engine/">
    <img
      src="docs/vortex-preview.png"
      width="100%"
      alt="Vortex AV Engine audio-reactive WebGL interface"
    >
  </a>
</p>

<p align="center">
  <a href="https://zazieproductions.github.io/vortex-av-engine/">
    <strong>⌰⟟ ENTER THE VORTEX ⍧⏧</strong>
  </a>
</p>

**VORTEX** is an experimental browser-based audiovisual instrument that translates uploaded audio into a responsive three-dimensional signal environment.

Rather than functioning as a conventional music visualizer, the project treats audio analysis as a control system. Frequency bands extracted through the Web Audio API continuously reshape a procedural WebGL scene: bass expands an inner core, midrange energy deforms a wireframe polyhedron, and high-frequency transients disperse a surrounding particle field. A dense, fictional modular-workstation interface exposes the system as an imagined creative tool rather than a passive animation.

## Project concept

VORTEX explores how sound can become spatial behavior, interface feedback, and visual material. It sits between:

- browser instrument design
- audio-reactive installation software
- generative and procedural graphics
- speculative music-interface design
- real-time signal visualization
- creative coding for performance and media art

The interface borrows the visual grammar of modular synthesis environments, digital audio workstations, scientific instrumentation, and cybernetic control rooms. Its controls and displays form a diegetic operating system for navigating a live audio signal.

## Features

- **Live Microphone / Line-in preview** with automated acoustic feedback protection (speak, clap, or play external music to visualize instantly)
- **Built-in Procedural Synthesizer generator** (generates a live 120 BPM sci-fi electronic soundtrack right inside your browser to preview reactivity)
- **Interactive Oscillator Bank controllers** (real-time control over lead arpeggiator pitch multipliers and lowpass bass filter cutoffs)
- Local drag-and-drop audio loading
- Audio playback entirely inside the browser
- Real-time frequency and waveform analysis
- Audio-reactive Three.js geometry deformation
- Bass-controlled core scaling
- Mid-frequency mesh displacement
- High-frequency particle expansion
- Adjustable animation speed and distortion depth
- Interactive modulation matrix
- Frequency-spectrum and waveform canvases
- Transport controls, playback timeline, system logs, and simulated telemetry
- Responsive WebGL resizing
- No server, build process, account, or uploaded audio required

## Signal mapping

| Audio data | Visual response |
| --- | --- |
| Low frequencies | Scale and pulse of the inner core |
| Midrange energy | Displacement of the outer icosahedral mesh |
| High frequencies | Expansion and recovery of the particle field |
| Playback position | Timeline and transport readout |
| User parameters | Animation rate and deformation intensity |

This mapping gives the visual system a legible internal logic: the image is not merely synchronized to amplitude, but divided into multiple behaviors driven by distinct spectral regions.

### Exact transfer functions

The analyser runs at `fftSize = 2048` (1024 bins, 23.44 Hz per bin at 48 kHz) with
`smoothingTimeConstant = 0.85`. Each frame the spectrum is reduced to three band means, which drive
disjoint visual subsystems:

| Band | Bins | Range @ 48 kHz | Target | Transfer function |
| --- | --- | --- | --- | --- |
| Bass | 0–9 | 0 – 234 Hz | Inner-core scale | `1 + (bass / 255) · (distortion · 2)` |
| Mid | 10–101 | 234 Hz – 2.39 kHz | Mesh displacement | `noise(v, t) · (mid / 50) · distortion` |
| High | 102–1023 | 2.39 – 24 kHz | Particle dispersion | `high > 100 → ×1.005/frame, else lerp home (α = 0.02)` |

The band split is deliberately lopsided: an FFT is linear in frequency while hearing is
logarithmic, so a narrow 1% bass window keeps the core pulse transient-accurate, and the wide 90%
high band functions as a broadband transient detector rather than a treble meter. Full derivation in
[docs/signal-flow.md](docs/signal-flow.md); the reasoning is recorded in
[ADR-0002](docs/adr/0002-proportional-band-split.md).

## Technology

- **JavaScript** for state, interaction, animation, and signal mapping
- **Web Audio API** for decoding, playback, and real-time analysis
- **Three.js / WebGL** for the deforming mesh, particles, camera, fog, and lighting
- **Canvas 2D** for frequency and waveform displays
- **Tailwind CSS** plus custom CSS for the dense workstation interface
- **Google Fonts** for the technical display typography

### Engineering characteristics

| Property | Value |
| --- | --- |
| FFT size / bins / bin width | 2048 / 1024 / 23.44 Hz @ 48 kHz |
| Morphed mesh vertices | 15 360 (icosahedron detail 4, non-indexed, CPU morph per frame) |
| Particle count | 4000 points, additive blending |
| Sequencer | 16th notes @ 120 BPM, 64-step loop, 100 ms lookahead scheduler |
| Frame budget | 16.67 ms target; ~7–11 ms typical on integrated graphics |
| Audio → visual latency | ~50–150 ms end to end |
| Build step | None — three static files, deployed verbatim |

Notable implementation details, each documented in full:

- **Acoustic feedback interlock.** Microphone input structurally severs the analyser's edge to
  `destination`, so live capture drives the visuals but is never monitored
  ([architecture.md §6](docs/architecture.md#6-acoustic-feedback-interlock)).
- **Rest-pose vertex morphing.** The mesh is re-derived every frame from a pristine copy of its
  position buffer rather than accumulated, so the geometry is a pure function of
  `(time, mid, distortion)` and cannot drift ([ADR-0001](docs/adr/0001-cpu-vertex-morph.md)).
- **Lookahead scheduling.** The synthesiser schedules notes on the sample-accurate audio clock from
  a coarse 25 ms timer, so timing is immune to main-thread load — which matters when the same thread
  is morphing 15 360 vertices per frame
  ([synthesis-engine.md §2](docs/synthesis-engine.md#2-lookahead-scheduling)).
- **Single teardown funnel.** All three transports release through one exhaustive, re-entrant-safe
  `stopAllSources()` path ([architecture.md §7](docs/architecture.md#7-teardown-funnel)).

## Documentation

Full technical documentation lives in [`docs/`](docs/README.md):

| Document | Covers |
| --- | --- |
| [architecture.md](docs/architecture.md) | Runtime topology, module map, state contract, frame pipeline, teardown |
| [signal-flow.md](docs/signal-flow.md) | Web Audio graphs, FFT math, band reduction, latency budget, privacy |
| [render-pipeline.md](docs/render-pipeline.md) | Scene graph, vertex morph derivation, particle model, tuning constants |
| [synthesis-engine.md](docs/synthesis-engine.md) | Lookahead scheduler, 64-step sequence, four voice designs |
| [api-reference.md](docs/api-reference.md) | Internal function reference and DevTools console recipes |
| [performance.md](docs/performance.md) | Frame budget, hot path analysis, profiling, low-end tuning ladder |
| [adr/](docs/adr/README.md) | Architecture decision records — the reasoning behind the trade-offs |

## Run locally

No installation is required. Clone the repository and open `index.html` in a modern browser:

```bash
git clone https://github.com/YOUR-USERNAME/vortex-av-engine.git
cd vortex-av-engine
open index.html
```

For the most consistent browser behavior, serve it locally:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Interaction

### Live Audio & Synthesizer Preview
1. Click **🎤 MIC / LINE INPUT** to authorize browser microphone access. The 3D scene and analyzers will instantly react live to your voice, clapping, or background speakers.
2. Click **🎹 SYNTH / GEN DEMO** to fire up the generative synthesizer engine. It will loop a 120 BPM deep techno arpeggiator track.
3. Use the **OSCILLATOR_BANK** sliders to tune the synthesizer in real-time:
   - Adjust **LEAD PITCH** to shift the multiplier of the arpeggiated lead line.
   - Adjust **BASS FILTER** to change the lowpass cutoff frequency of the driving sub-bass.

### File Playback
1. Drag an MP3, WAV, or other browser-supported audio file into the input panel (or click **BROWSE**).
2. Press **PLAY**.
3. Adjust **Speed** to alter the motion rate.
4. Adjust **Distortion** to intensify mesh deformation and bass response.
5. Toggle cells in the modulation matrix as part of the interface experiment.

Audio remains local to the user's browser. The project does not transmit or store uploaded files.

## Repository structure

```text
vortex-av-engine/
├── index.html
├── assets/
│   ├── css/
│   │   └── styles.css
│   └── js/
│       └── app.js
├── docs/
│   ├── README.md                 # documentation index
│   ├── architecture.md           # runtime topology, state contract, frame pipeline
│   ├── signal-flow.md            # Web Audio graph, FFT config, band-reduction math
│   ├── render-pipeline.md        # scene graph, vertex morph model, particle system
│   ├── synthesis-engine.md       # lookahead scheduler, sequence, voice designs
│   ├── api-reference.md          # internal function reference + console recipes
│   ├── performance.md            # frame budget, hot paths, profiling, tuning
│   └── adr/                      # architecture decision records (0001–0005)
├── .github/workflows/static.yml
├── CONTRIBUTING.md
├── LICENSE
└── README.md
```

## Design significance

The project demonstrates a creative-technology workflow that combines frontend engineering, procedural graphics, digital signal analysis, interaction design, and sound-art thinking in one browser artifact. It is intentionally presented as a fictional instrument: the visual language helps users understand the audio-reactive system while also giving the software a distinct narrative identity.

## Current limitations

Stated plainly, with the reasoning recorded where a decision was involved:

- **The modulation matrix is an interface study**, not a routing engine — toggling a cell perturbs
  the speed parameter rather than creating a real source→sink edge. The intended design is specified
  in [ADR-0004](docs/adr/0004-modulation-routing-layer.md).
- **The high band under-triggers on dark material.** Averaging 922 mostly-empty bins means quiet or
  low-passed tracks may never cross the particle-dispersion threshold
  ([ADR-0002](docs/adr/0002-proportional-band-split.md)).
- **The vertex morph is CPU-bound** at ~3–6 ms per frame and is the limiting factor on low-end and
  high-DPI devices. A vertex shader is the known fix
  ([ADR-0001](docs/adr/0001-cpu-vertex-morph.md), [performance.md §2](docs/performance.md#2-the-dominant-hot-path)).
- **Two typed arrays are allocated per frame** (~123 KB/s of garbage), with a documented two-line fix
  ([ADR-0005](docs/adr/0005-per-frame-typed-array-allocation.md)).
- **`devicePixelRatio` is unclamped**, so 3× displays render 9× the fragments
  ([performance.md §4](docs/performance.md#4-pixel-ratio-and-fill-rate)).
- **The synthesiser stutters in background tabs**, because `setInterval` is clamped to ≥1000 ms while
  the scheduler's lookahead window is only 100 ms.
- Several oscillator and EQ controls are visual prototypes; `params.colorShift` and
  `params.rotationSpeed` are declared but unread.
- Microphone input requires a secure context — `https://` or `localhost`, not `file://`.
- The dense workstation layout is optimized primarily for desktop displays.
- Three.js and Tailwind load from CDNs with no Subresource Integrity hashes
  ([ADR-0003](docs/adr/0003-cdn-dependencies.md)).

## Development roadmap

Ordered roughly by ratio of impact to effort. Items with a recorded design link to it.

**Near term — correctness and performance**

- clamp `devicePixelRatio` to 2 and hoist the per-frame typed arrays ([ADR-0005](docs/adr/0005-per-frame-typed-array-allocation.md))
- add Subresource Integrity hashes to CDN script tags ([ADR-0003](docs/adr/0003-cdn-dependencies.md))
- move the sequencer off `setInterval` to survive background tabs
- reduced-motion support via `prefers-reduced-motion`

**Medium term — architecture**

- GPU vertex displacement via `ShaderMaterial` ([ADR-0001](docs/adr/0001-cpu-vertex-morph.md))
- a real modulation routing layer ([ADR-0004](docs/adr/0004-modulation-routing-layer.md))
- perceptually-spaced frequency bands ([ADR-0002](docs/adr/0002-proportional-band-split.md))
- preset save/load through local storage — trivial once routing exists, since the edge list is the patch

**Longer term — capability**

- MIDI controller mapping via the Web MIDI API
- post-processing chain (bloom, chromatic aberration, feedback)
- recording and exporting visual performances via `MediaRecorder` + `canvas.captureStream()`
- OSC or WebSocket control for installation use
- Raspberry Pi or ESP32 sensor input
- projection and fullscreen performance modes
- per-voice metering, so visuals can be driven from stems rather than the mixed bus

## Suggested GitHub topics

`creative-coding` `web-audio-api` `threejs` `webgl` `audio-reactive` `audiovisual` `generative-art` `interactive-art` `browser-instrument` `sound-visualization` `procedural-animation` `speculative-interface`

## License

Released under the [MIT License](LICENSE).
