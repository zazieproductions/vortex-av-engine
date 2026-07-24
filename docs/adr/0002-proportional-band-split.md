# ADR-0002 — Proportional bin split for band reduction

- **Status:** Accepted
- **Scope:** `assets/js/app.js` — band reduction in `animate()`
- **Related:** [signal-flow.md §3](../signal-flow.md#3-band-reduction)

## Context

Each frame reduces 1024 FFT magnitude bins to three scalars that drive three independent visual
subsystems. The boundaries determine what the instrument "hears" as bass, mid, and treble.

An FFT is linear in frequency. At 48 kHz with `fftSize = 2048`, every bin is 23.44 Hz wide, so the
entire two-octave range from 20 Hz to 80 Hz — where a kick drum lives — occupies fewer than three
bins, while the top octave from 12 kHz to 24 kHz occupies 512. Hearing is roughly logarithmic, so a
naïve equal-thirds split by bin index would assign essentially the whole musical spectrum to "bass"
and almost nothing but air to the other two bands.

## Decision

Split proportionally by bin index, weighted heavily toward the low end:

```js
const lowerBound = Math.floor(bufferLength * 0.01);  // 1%  → bins   0 –   9
const midBound   = Math.floor(bufferLength * 0.10);  // 10% → bins  10 – 101
                                                     // 90% → bins 102 – 1023
```

Resolving at 48 kHz: bass 0–234 Hz, mid 234 Hz–2.39 kHz, high 2.39–24 kHz.

Bands are reduced by arithmetic mean, which normalises out the differing widths and keeps all three
outputs in the same 0–255 domain as the source bins — so downstream transfer functions can be
written without per-band scale factors.

The proportional form (`bufferLength * 0.01`) rather than hard-coded indices means the split
survives a change to `fftSize`: the boundaries stay at the same fractions of Nyquist.

The 1% bass window is the load-bearing choice. It corresponds to roughly the lowest 1% of the linear
spectrum but, perceptually, to the bottom three and a half octaves of music. Widening it would
average a loud kick transient into a long tail of near-silent bins and visibly deaden the core pulse.
Ten bins is narrow enough that the mean tracks the kick's actual envelope.

The 90% high band is doing something different from the other two: it is a **broadband transient
detector**, not a treble meter. Its mean sits low most of the time because most of those bins are
empty on most material, and it rises sharply when a cymbal or a percussive attack spreads energy
across the top of the spectrum. That is exactly the gate condition the particle dispersion wants, so
the "wrong" band width produces the right behaviour.

## Consequences

**Accepted:**

- The high band's mean rarely exceeds the `> 100` dispersion threshold on quiet, low-passed, or
  bass-heavy material. Such content will not trigger particle dispersion at all — visible as a
  static field on, say, a dub techno track.
- Band boundaries drift slightly with the device sample rate: at 44.1 kHz the bass ceiling is 215 Hz
  rather than 234 Hz. Immaterial perceptually, but worth knowing when comparing captures.
- The mid band spans a musically enormous range (234 Hz – 2.39 kHz), so it responds to almost any
  harmonic content rather than discriminating between instruments.

**Gained:**

- A responsive, transient-accurate bass channel — the most perceptually important of the three,
  since it drives the core pulse that reads as "the beat."
- A high channel that behaves as a well-tuned transient gate without any onset-detection machinery.
- Resolution-independent boundaries under changes to `fftSize`.
- Three lines of code and one linear pass over the bins: the entire analysis layer costs ~0.3 ms.

## Alternatives considered

**Fixed frequency boundaries** (e.g. 20–250 Hz / 250 Hz–4 kHz / 4–20 kHz) computed from
`sampleRate`. More explicit and sample-rate stable. Rejected as roughly equivalent in output while
requiring the conversion arithmetic; a reasonable refactor, not a behavioural improvement.

**Logarithmic or Bark/Mel-spaced bands.** Perceptually correct, and the right answer for a
metering-grade analyser. Rejected for this iteration as disproportionate: it needs a bin-to-band
mapping table and per-band normalisation to keep outputs comparable, for a visualiser whose
mappings are tuned by eye regardless.

**Per-band peak instead of mean.** Far more responsive to transients, especially in the wide high
band. Rejected because peak-following makes the geometry strobe; the analyser's own
`smoothingTimeConstant` is already the intended smoothing mechanism, and mean reduction composes
with it cleanly.

**Weighted mean with an A-weighting curve.** Best perceptual accuracy of the options. Deferred to
the routing layer ([ADR-0004](0004-modulation-routing-layer.md)), where per-edge response curves
would make it a configuration choice rather than a hard-coded one.

## Revisiting

Replace with perceptually-spaced bands if the instrument is used with material outside the
four-on-the-floor idiom it was tuned against — acoustic, orchestral, or speech content in particular
will expose the high band's insensitivity. The natural home for that work is the routing layer,
where band definitions become named, user-configurable sources.
