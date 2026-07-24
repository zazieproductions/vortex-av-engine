# Procedural Synthesis Engine

The built-in generator exists so the instrument can demonstrate itself with no audio file and no
microphone permission. It is a four-voice, 64-step sequencer built entirely from Web Audio primitives
— no samples, no external assets.

---

## 1. Why a synthesiser at all

A visualiser with an empty state is impossible to evaluate. Shipping an audio file would add
megabytes to a static repo and raise licensing questions; requiring microphone access puts a
permission prompt between the visitor and the work. Generating the signal in-page solves both: the
demo is a few hundred bytes of code, is legally unencumbered, and starts on a single click. It also
gives the visuals a *known* signal — the band mapping can be verified against content whose spectral
distribution is fully specified.

## 2. Lookahead scheduling

Naïvely triggering notes from `setInterval` produces audible jitter, because timer callbacks are
subject to main-thread scheduling and are throttled in background tabs. VORTEX uses the standard
**lookahead scheduler** pattern (Chris Wilson, *A Tale of Two Clocks*): a coarse, unreliable timer
drives a loop that schedules events at sample-accurate times on the audio clock.

```js
const scheduleAheadTime = 0.1;              // schedule 100 ms into the future
const bpm = 120;
const stepDuration = 60 / bpm / 4;          // 16th note = 0.125 s
let nextNoteTime = state.audioContext.currentTime;

state.synthTimer = setInterval(() => {
    while (nextNoteTime < state.audioContext.currentTime + scheduleAheadTime) {
        scheduleStep(state.currentStep, nextNoteTime);
        updateTimelineUI(state.currentStep / 64);
        nextNoteTime += stepDuration;
        state.currentStep = (state.currentStep + 1) % 64;
    }
}, 25);
```

**Parameter rationale**

| Parameter | Value | Why |
| --- | --- | --- |
| Timer interval | 25 ms | 4× oversampling of the 100 ms horizon: three consecutive missed ticks are still recoverable. |
| Lookahead | 100 ms | Long enough to absorb GC pauses and layout jank; short enough that parameter changes feel immediate. |
| Step duration | 125 ms | 16th notes at 120 BPM. Lookahead is always < one step, so at most one step is ever queued ahead. |

Because every voice is started with an explicit `time` argument, the audio hardware — not the
JavaScript event loop — determines when a note sounds. Timing is sample-accurate regardless of main
thread load, which matters here: the render loop is doing 15 360 vertex updates per frame on the same
thread.

**Latency consequence.** Slider changes to `leadPitchMult` and `bassFilterFreq` are read at *schedule*
time, so they take effect up to 100 ms later. This is imperceptible in practice and is the standard
trade-off for jitter-free scheduling.

## 3. Sequence structure

64 steps = 4 bars of 16 steps. `scheduleStep()` derives `bar = ⌊step / 16⌋` and
`stepInBar = step % 16`, then selects harmony from a four-bar progression in C minor:

| Bar | Root | Freq | Arpeggio | Chord |
| --- | --- | --- | --- | --- |
| 0 | C2 | 65.41 Hz | C4 · E♭4 · G4 · B♭4 | Cm7 |
| 1 | A♭1 | 51.91 Hz | A♭3 · C4 · E♭4 · A♭4 | A♭maj |
| 2 | B♭1 | 58.27 Hz | B♭3 · D4 · F4 · B♭4 | B♭maj |
| 3 | G1 | 49.00 Hz | G3 · B3 · D4 · G4 | G maj |

i – ♭VI – ♭VII – V: the natural-minor loop with a raised third on the final chord, giving a
leading tone that pulls the 4-bar cycle back to the tonic. Frequencies are hard-coded in
equal temperament (A4 = 440 Hz).

### Rhythm grid

```
step    0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15
kick    ●  ─  ─  ─  ●  ─  ─  ─  ●  ─  ─  ─  ●  ─  ─  ─
bass    ●  ─  ●  ●  ─  ─  ●  ─  ●  ─  ●  ●  ─  ─  ●  ─
hat(H)  ─  ─  ●  ─  ─  ─  ●  ─  ─  ─  ●  ─  ─  ─  ●  ─
hat(L)  ○  ─  ○  ─  ○  ─  ○  ─  ○  ─  ○  ─  ○  ─  ○  ─
lead    ●  ─  ─  ●  ●  ─  ─  ●  ●  ─  ─  ●  ●  ─  ─  ●
```

`●` deterministic hit · `○` 60% probability (`Math.random() > 0.4`)

- **Kick** on every downbeat — four-on-the-floor, the canonical 120 BPM techno pulse.
- **Bass** syncopated across steps `[0, 2, 3, 6, 8, 10, 11, 14]`, alternating octaves
  (`root × 1` on multiples of 4, `root × 2` elsewhere) so the low end has internal movement.
- **Hi-hats** heavy on the offbeat 8ths at 0.45 gain, with light 0.15-gain 16ths filled in
  probabilistically. That single stochastic gate is what keeps a 4-bar loop from sounding mechanical
  over long playback.
- **Lead** on `[0, 3, 4, 7, 8, 11, 12, 15]` — a 3-against-4 pattern that phases against the kick.
  The arpeggio index is `(stepInBar × 3) % 4`, walking the chord tones in a non-adjacent order.

Each visual subsystem is driven by a different voice group by construction: kick and bass feed the
0–234 Hz bass band (core pulse), the lead's bandpass output lands in the mid band (mesh
displacement), and the 7 kHz-highpassed hats sit squarely in the high band (particle dispersion).
The demo is engineered to exercise all three mappings simultaneously.

## 4. Voice designs

Every voice is constructed per-note and self-terminating: nodes are created, scheduled, started, and
stopped within the call. Web Audio garbage-collects source nodes once they have finished and their
references are dropped, so no voice pooling is needed at this event density (~8 voices/second).

All voices connect to `state.analyser`, which acts as the master bus.

### Kick — `playKick(time)`

```
OscillatorNode(sine) ──▶ GainNode ──▶ analyser
```

| Envelope | From | To | Time |
| --- | --- | --- | --- |
| Frequency | 150 Hz | 45 Hz | 0.15 s (exponential) |
| Gain | 1.0 | 0.001 | 0.16 s (exponential) |

A pitch-swept sine is the classic synthesised kick (TR-909 lineage): the fast downward sweep supplies
the click transient, the 45 Hz tail supplies the body. Node lifetime 0.18 s.

### Bass — `playBass(freq, time)`

```
OscillatorNode(sawtooth) ──▶ BiquadFilterNode(lowpass) ──▶ GainNode ──▶ analyser
```

The filter cutoff traces a two-stage envelope around the user-controlled base cutoff *f꜀*
(`params.bassFilterFreq`, 100–1200 Hz):

| Stage | Cutoff | Time |
| --- | --- | --- |
| Attack | *f꜀* → 2·*f꜀* | 0 → 0.05 s |
| Decay | 2·*f꜀* → *f꜀*/3 | 0.05 → 0.15 s |

A sawtooth carries every harmonic, so the moving lowpass is what makes the note *speak* — the brief
opening lets upper harmonics through as an attack, then closing to *f꜀*/3 leaves a rounded sub. This
is subtractive synthesis in its most literal form, and exposing *f꜀* as a slider makes the technique
directly audible.

Peak gain 0.35, decaying to silence in 0.12 s. Node lifetime 0.15 s.

### Hi-hat — `playHihat(time, volume)`

```
AudioBufferSourceNode(noise) ──▶ BiquadFilterNode(highpass 7 kHz) ──▶ GainNode ──▶ analyser
```

Source material is a **cached** 100 ms buffer of uniform white noise, generated once by
`getNoiseBuffer()` and reused for every hit — regenerating it per note would allocate a
`Float32Array` of ~4800 samples 8 times a second for no perceptual gain.

A 7 kHz highpass discards everything below the cymbal's spectral region; a 40 ms exponential decay
does the rest. Node lifetime 0.05 s.

### Lead — `playLead(freq, time)`

```
OscillatorNode(triangle) ──▶ BiquadFilterNode(bandpass, Q=3) ──▶ GainNode ──▶ analyser
```

| Envelope | From | To | Time |
| --- | --- | --- | --- |
| Filter centre | 1200 Hz | freq × 1.5 | 0.1 s (exponential) |
| Gain | 0.2 | 0.001 | 0.2 s (exponential) |

A triangle wave has only odd harmonics rolling off at −12 dB/octave, making it soft enough to sit
under the saw bass. The resonant bandpass sweeping down toward the note's own 1.5× partial produces
a vocal, formant-like character. Frequency is multiplied by `params.leadPitchMult` (0.5–2.0) at
schedule time, so the slider transposes the arpeggio across two octaves continuously — including
non-tempered ratios, which is the point.

## 5. Timeline behaviour

The synth has no duration, so the transport UI is repurposed:

- Total time reads `∞ (LOOPING)`.
- Current time reads `STEP_nn` from `state.currentStep`.
- The playback bar maps `currentStep / 64`, so it sweeps once per 4-bar cycle (8 seconds).

## 6. Teardown

`stopAllSources()` clears the scheduler interval. Notes already scheduled inside the 100 ms lookahead
window still sound — they are committed to the audio hardware and cannot be recalled — so playback
tails off within ~100 ms rather than cutting instantly. The analyser's destination edge is then
disconnected, and the cached noise buffer is intentionally retained across sessions for fast restart.

## 7. Extension notes

- **Swing** — offset odd steps by `stepDuration · swing` when computing `nextNoteTime`.
- **Tempo** — `bpm` is a local constant inside `startSynth()`; promoting it to `params` requires
  recomputing `stepDuration` without disturbing `nextNoteTime`.
- **Longer forms** — the `% 64` wrap and the `bar` switch are the only structural assumptions; both
  generalise to an arbitrary progression array.
- **Per-voice metering** — insert a `GainNode` per voice group and give each its own analyser to
  drive visuals from stems rather than from the mixed bus.
