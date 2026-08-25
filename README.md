# Dream Unity — Experimental Three-World Problem

A visual-first, mobile-compatible 3D portal containing nine distinct arcade experiences across three coupled worlds:

1. **Dream Machine** — Perceive, Model, Predict.
2. **Dream Maker** — Intend, Act, Become.
3. **Dream World** — Matter, Structure, Emerge.

The overview can be orbited by mouse or touch. Selecting a world exposes its internal triad; selecting an internal label opens the corresponding game.

## Nine-game cognitive division of labour

| Portal | Game | Primary operation |
|---|---|---|
| **PERCEIVE** | **Parallax Wing** | Discover and exploit causal relations that are simultaneously visible in a moving fighter formation. |
| **MODEL** | **Model Forge** | Encode and reconstruct a hidden network. |
| **PREDICT** | **Oracle Gates** | Extrapolate motion through an occluded interval. |
| **INTEND** | **Vector Vow** | Select, charge and commit a planned trajectory. |
| **ACT** | **Impulse Run** | Convert perception into immediate movement under speed pressure. |
| **BECOME** | **Become Reality Lab** | Construct, inhabit, score and deliberately exit controlled imagined realities, then transfer the trained state to real action. |
| **MATTER** | **Gravity Foundry** | Manipulate attraction and material selection. |
| **STRUCTURE** | **Lattice Lock** | Construct coherent connectivity across a grid. |
| **EMERGE** | **Genesis Bloom** | Produce global cascades from local interactions. |

The games are intentionally non-interchangeable. Model Forge trains reconstruction, Oracle Gates trains forward extrapolation, Parallax Wing trains direct extraction of causal structure from the present visual field, and Become trains deliberate experiential simulation and transfer.

## Parallax Wing — Causal Weave prototype

Parallax Wing occupies **Dream Machine → PERCEIVE**.

The game no longer states a relational rule and no aircraft is designated as “the answer.” Instead, the moving world repeatedly demonstrates contrasting causal events:

- **when a relation exists, a shield opens and a shot penetrates;**
- **when a superficially similar relation does not exist, the shield holds and the shot ricochets.**

The first positive and negative examples for each law are demonstrated entirely through aircraft movement, energy transfer and weapon consequence. The player is then placed inside transformed versions of the same causal system. The instruction card says only: **“Watch what the formation causes. Exploit the opening.”**

### Three experiential relational laws

#### 1. Between

Two fighters exchange shield energy through a visible link while a third fighter crosses the formation. The crossing fighter becomes vulnerable only when it is genuinely **between** the linked pair:

- it lies within the finite segment joining them;
- it is sufficiently close to the joining line;
- it is actually crossing rather than merely sitting near alignment.

Crossing the line beyond an endpoint, passing close without entering the relation, or remaining statically aligned does **not** open the shield.

#### 2. Flow

The same between-relation is combined with directional energy flow. When the crossing occurs, the **downstream endpoint** becomes vulnerable. Reversing the current reverses which endpoint opens. The player must bind:

**crossing relation + visible current direction → vulnerable endpoint**

Shooting the crossing fighter, the upstream endpoint, or a nearby aircraft represents a different mistaken relation.

#### 3. Enclosure

Three fighters create a moving triangular shield circuit. A fourth becomes vulnerable only when it is genuinely enclosed with sufficient margin. Passing near an edge, touching the boundary, remaining outside, or entering a collapsed/open triangle does not produce the consequence.

### Why this belongs to PERCEIVE

Everything needed for the judgment remains visible in the present moment: aircraft positions, links, motion, flow direction, enclosure and shield consequence. The player is not reconstructing a hidden graph as in Model Forge and is not calculating an occluded future state as in Oracle Gates.

The training sequence is:

**experience consequence → compare positive and negative cases → extract the relation → recognize it under rotation, scale, translation and identity change → act through combat**

### Difficulty and anti-shortcut design

- all hostile fighters use the same underlying appearance;
- identities and logical roles are randomized each episode;
- orientation, scale, lane and motion vary procedurally;
- positive and negative episodes are interleaved;
- exact near-misses define what the relation is **not**;
- early shield openings are legible, then causal assistance fades;
- later levels switch among the three learned laws;
- heat and shield penalties prevent indiscriminate firing;
- negative episodes reward correct withholding rather than constant shooting;
- the same rules are transformation-equivariant and do not depend on screen side or colour.

False shots are classified as line-extension confusion, near-but-not-between, static-alignment substitution, relay-for-downstream-endpoint substitution, wrong flow endpoint, boundary-for-enclosed-object substitution, stale causal target, surface proximity substitution or late causal acquisition.

The game stores law-specific accuracy, withholding, misses, firing accuracy, response latency, cue strength and error topology locally. These are experimental gameplay measurements, not a validated clinical or IQ assessment.

## Become Reality Lab — Controlled as-if training

Become occupies **Dream Maker → BECOME**, leaving the other eight portal positions intact.

The prototype treats vivid imagination as a trainable system rather than one undifferentiated ability. The live GPT layer generates a genuinely new first-person scenario for each requested trial, while the local laboratory retains the controlled 10-second faculty sequence, measurement architecture and personal transfer process.

Each scenario trains seventeen faculties independently: Sensory Presence, Object Tangibility, Spatial Embodiment, Atmospheric Presence, Kinaesthetic Motion, Attentional Immersion, Premise Acceptance, Experiential Conviction, Consequence Presence, Emotional Resonance, Physiological Resonance, Agency, Behavioural Authenticity, Identity Inhabitation, Premise Fidelity, Integrated Reality and Exit Control.

After the fictional scenarios, the player defines a real goal or dilemma, an observable success point and one executable next action. The laboratory then runs eight transfer drills and a 30-second state-entry test. Personal transfer text remains in active page memory and is not sent to the scenario generator.

## Controls

### Dream Unity overview

- **Mouse or touch drag:** orbit the three-world structure.
- **Pinch or wheel:** zoom.
- **Two-finger twist:** roll.
- **Tap a world, then an internal title:** open its game.

### Parallax Wing

- **Mouse:** move to aim; click to fire.
- **Touch:** drag to manoeuvre; tap to fire.
- **Keyboard:** WASD or arrows move; Space fires.
- Enemy projectiles can be dodged or intercepted.

### Become Reality Lab

- Use the on-screen controls on mouse, touch or keyboard.
- Each timer starts only after an explicit action.
- During a rating screen, press 1–9, or 0 for 10.
- Pause, restart, sound and return controls remain available in the shared header.

## Shared architecture

All nine games retain shared navigation, local best scores, responsive layouts, synthesized audio, capped rendering on lower-powered devices and suspension of the 3D overview while a game is active. No external game engine, model, font, analytics service or video asset is required by the arcade runtime.

Key files:

- `main.js` — three-world 3D overview and portal interaction.
- `styles.css` — common Dream Unity and arcade styling.
- `become.css` — responsive Become interface and training readouts.
- `arcade.js` — versioned loader that assembles the base engine and isolated replacements.
- `arcade-parts/part-01.txt` … `part-05.txt` — original unified nine-game runtime.
- `arcade-parts/perceive-role-logic.txt` — pure causal segment, flow, enclosure and diagnostic geometry.
- `arcade-parts/perceive-aerial-01.txt` … `perceive-aerial-08.txt` — Parallax Wing combat, demonstrations, telemetry and rendering.
- `arcade-parts/become-lab-01.txt` — Become timers, scoring, transfer and measurement.
- `arcade-parts/become-live-02.txt` — live GPT scenario sourcing.
- `tests/causal-weave.test.mjs` — deterministic positive/negative, transformation and diagnostic tests.
- `tests/validate.mjs` — nine-portal compatibility, syntax, static integration and runtime smoke validation.

## Validation and deployment

```bash
npm test
```

GitHub Actions validates every pull request. After a push to `main`, it waits for GitHub Pages, compares the live HTML, styling, loader and every game chunk byte-for-byte against the validated source, verifies the Become service identity and commits a machine-readable deployment receipt.
