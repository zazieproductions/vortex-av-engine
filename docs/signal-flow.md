# Signal Flow & Analysis

Reference for the Web Audio graph, analyser configuration, and the band-reduction mathematics that
turn an FFT frame into three control values.

---

## 1. Node graphs by source type

All three transports converge on one shared `AnalyserNode`. Only the terminal edge differs.

### File playback

```
AudioBufferSourceNode ──▶ AnalyserNode ──▶ AudioDestinationNode
   (decoded PCM)           (FFT tap)         (speakers)
```

### Microphone / line input

```
MediaStreamAudioSourceNode ──▶ AnalyserNode ──╳  (destination edge severed)
   (getUserMedia)                                 feedback interlock
```

### Procedural synthesiser

```
OscillatorNode ─▶ BiquadFilterNode ─▶ GainNode ─┐
AudioBufferSourceNode ─▶ Biquad ─▶ Gain ────────┼─▶ AnalyserNode ──▶ Destination
   (noise, hi-hat)                              │
OscillatorNode ─▶ GainNode (kick) ──────────────┘
```

Every synth voice connects its own gain stage directly to the analyser. The analyser therefore acts
as the engine's implicit master bus — a deliberate simplification that guarantees the visuals see
exactly the signal the listener hears, with no separate metering path to drift out of sync.

## 2. Analyser configuration

```js
analyser.fftSize = 2048;                 // → frequencyBinCount = 1024
analyser.smoothingTimeConstant = 0.85;   // exponential moving average across frames
```

**Derived properties** at a typical 48 kHz sample rate:

| Property | Formula | Value @ 48 kHz | Value @ 44.1 kHz |
| --- | --- | --- | --- |
| Bin count | `fftSize / 2` | 1024 | 1024 |
| Nyquist | `sampleRate / 2` | 24 000 Hz | 22 050 Hz |
| Bin width | `sampleRate / fftSize` | 23.44 Hz | 21.53 Hz |
| Window length | `fftSize / sampleRate` | 42.7 ms | 46.4 ms |

The 2048-point window is the standard trade-off point for music visualisation: ~23 Hz resolution is
enough to separate a kick fundamental from a bass note, while a ~43 ms window still tracks
16th notes at 120 BPM (125 ms per step) without visible lag.

**Smoothing.** The analyser applies

```
X̂[k, t] = τ · X̂[k, t−1] + (1 − τ) · |X[k, t]|,   τ = 0.85
```

giving a time constant of roughly `−1 / (60 · ln τ) ≈ 0.10 s` at 60 fps. This is what makes the
geometry breathe instead of strobe. Lower τ toward 0.6 for percussive, twitchy response; raise
toward 0.95 for slow ambient material.

## 3. Band reduction

Each frame, the 1024-bin magnitude array (`Uint8Array`, 0–255, dB-scaled by the spec's
`minDecibels`/`maxDecibels` mapping) is reduced to three scalar averages by **proportional bin
split**, not by absolute frequency:

```js
const lowerBound = Math.floor(bufferLength * 0.01);  // bins   0 –   9
const midBound   = Math.floor(bufferLength * 0.10);  // bins  10 – 101
                                                     // bins 102 – 1023 → high
```

Resolving the boundaries to frequency at 48 kHz:

| Band | Bins | Frequency range | Width | Musical content |
| --- | --- | --- | --- | --- |
| **Bass** | 0 – 9 | 0 – 234 Hz | 234 Hz | Kick fundamental, sub, bass notes |
| **Mid** | 10 – 101 | 234 Hz – 2.39 kHz | 2.15 kHz | Body of most instruments, vocals, chords |
| **High** | 102 – 1023 | 2.39 kHz – 24 kHz | 21.6 kHz | Hats, transients, air, sibilance |

Each band is a plain arithmetic mean of its bins, so the result is in the same 0–255 domain
regardless of band width:

```
E_band = (1 / |B|) · Σ_{k ∈ B} X̂[k]
```

### Why the bands are so lopsided

An FFT is linear in frequency; hearing is roughly logarithmic. Allocating just 1% of the bins to
bass and 90% to highs looks unbalanced on paper, but perceptually the low decade carries most of the
energy in modern music, so a narrow bass window keeps `bassFreq` responsive rather than
averaging a loud kick into 200 silent bins. The wide high band conversely acts as a
broadband transient detector — its mean stays low most of the time and spikes on cymbals and
percussive attacks, which is exactly the gate condition the particle field wants.

**Known consequence.** Because the high band averages 922 mostly-empty bins, its mean rarely exceeds
the `highFreq > 100` particle-dispersion threshold on quiet or low-passed material. Content with
little high-frequency energy will not trigger dispersion. A perceptually-weighted (log-spaced or
Bark/Mel) band split is the documented fix — see
[ADR-0002](adr/0002-proportional-band-split.md).

## 4. Time-domain path

In parallel with the magnitude spectrum, `getByteTimeDomainData()` fills a second `Uint8Array` of the
same length with the windowed waveform, centred on 128 (silence). The oscilloscope maps it as:

```
v = data[i] / 128.0        // 0.0 … 2.0, with 1.0 = zero crossing
y = v * height / 2         // 0 … height, centred
```

This path is display-only; it drives no geometry. It exists as a phase-accurate ground truth next to
the smoothed spectrum, which is useful when debugging whether a visual artefact originates in the
signal or in the mapping.

## 5. Control mapping

The three band energies drive disjoint visual subsystems. Normalisation differs per target, which is
why each mapping is listed with its exact transfer function.

| Source | Target | Transfer function | Range |
| --- | --- | --- | --- |
| `bassFreq` | Inner-core uniform scale | `1 + (bass / 255) · (distortion · 2)` | 1.0 → 1 + 2·d |
| `bassFreq` | Rotation rate bonus | `speed · 0.01 + bass · 0.0002` | +0 → +0.051 rad/frame |
| `midFreq` | Mesh displacement depth | `noise · (mid / 50) · distortion` | ±0 → ±5.1·d units |
| `highFreq` | Particle dispersion gate | `high > 100 → ×1.005/frame, else lerp home (α = 0.02)` | binary gate |
| `bassFreq` | Telemetry readout | `floor(bass · 0.2 + 10)` | 10 → 61 |

Two normalisation constants are worth calling out:

- **`/255`** for bass is a true normalisation to unit range — the core scale is bounded and
  predictable.
- **`/50`** for mids is an intentional over-drive: mid energies above 50/255 push the displacement
  multiplier past 1.0, so loud passages visibly break the sphere's silhouette instead of
  asymptotically approaching it. Combined with `params.distortion ∈ [0, 2]`, peak displacement is
  ±10.2 units against a radius of 10 — the geometry can fully invert at extreme settings, which is
  the intended failure mode.

## 6. Latency budget

| Contribution | Typical |
| --- | --- |
| FFT window (half-window effective group delay) | ~21 ms |
| Smoothing time constant (τ = 0.85 @ 60 fps) | ~100 ms |
| Frame quantisation (one `rAF` tick) | ~17 ms |
| Output device buffer | 5 – 25 ms |
| **Perceived audio→visual lag** | **~50 – 150 ms** |

Well under the ~200 ms threshold at which cross-modal sync breaks down for continuous material,
though transient-heavy content benefits from lowering `smoothingTimeConstant`.

## 7. Privacy properties

- Decoded audio never leaves the page: `FileReader` → `ArrayBuffer` → `decodeAudioData`, with no
  `fetch`/`XHR`/`WebSocket` in the runtime.
- Microphone capture is analysis-only and never recorded, buffered, or transmitted; `stopAllSources()`
  calls `track.stop()` on every track, which releases the OS capture indicator.
- The only outbound network requests on the page are the CDN fetches for Three.js, Tailwind, and
  Google Fonts at load time. See [ADR-0003](adr/0003-cdn-dependencies.md) for the vendoring
  trade-off.
