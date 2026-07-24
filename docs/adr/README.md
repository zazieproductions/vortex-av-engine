# Architecture Decision Records

Short documents recording the significant technical decisions behind VORTEX: the context that forced
a choice, the option taken, and the consequences accepted.

The format follows Michael Nygard's ADR template. Records are immutable once accepted — a decision
that is later reversed gets a new record that supersedes the old one, rather than an edit.

| # | Title | Status |
| --- | --- | --- |
| [0001](0001-cpu-vertex-morph.md) | CPU vertex morphing instead of a vertex shader | Accepted |
| [0002](0002-proportional-band-split.md) | Proportional bin split for band reduction | Accepted |
| [0003](0003-cdn-dependencies.md) | CDN-hosted dependencies and no build step | Accepted |
| [0004](0004-modulation-routing-layer.md) | Deferred modulation routing layer | Proposed |
| [0005](0005-per-frame-typed-array-allocation.md) | Per-frame typed array allocation | Accepted (with known fix) |

## Writing a new record

Copy the structure of an existing file: **Context → Decision → Consequences → Alternatives
considered**. Number sequentially. Keep it to one page — an ADR is a decision log, not a design
document; detailed mechanics belong in the topic docs it links to.
