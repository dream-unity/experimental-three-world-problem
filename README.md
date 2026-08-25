# Dream Unity — Experimental Three-World Problem

A visual-first, mobile-compatible 3D portal containing nine distinct arcade experiences across three coupled worlds:

1. **Dream Machine** — Perceive, Model, Predict.
2. **Dream Maker** — Intend, Act, Become.
3. **Dream World** — Matter, Structure, Emerge.

The overview can be orbited by mouse or touch. Selecting a world exposes its internal triad; selecting an internal label opens the corresponding game.

## Nine-game cognitive division of labour

| Portal | Game | Primary operation |
|---|---|---|
| **PERCEIVE** | **Parallax Wing** | Continuously identify which fighter currently occupies a changing relational role. |
| **MODEL** | **Model Forge** | Encode and reconstruct a hidden network. |
| **PREDICT** | **Oracle Gates** | Extrapolate motion through an occluded interval. |
| **INTEND** | **Vector Vow** | Select, charge and commit a planned trajectory. |
| **ACT** | **Impulse Run** | Convert perception into immediate movement under speed pressure. |
| **BECOME** | **Become Reality Lab** | Construct, inhabit, score and deliberately exit controlled imagined realities, then transfer the trained state to real action. |
| **MATTER** | **Gravity Foundry** | Manipulate attraction and material selection. |
| **STRUCTURE** | **Lattice Lock** | Construct coherent connectivity across a grid. |
| **EMERGE** | **Genesis Bloom** | Produce global cascades from local interactions. |

The games are intentionally non-interchangeable. Model Forge trains reconstruction, Oracle Gates trains forward extrapolation, Parallax Wing trains direct perception of a relation that exists now, and Become trains deliberate experiential simulation and transfer.

## Parallax Wing — Relational Identity Drift

Parallax Wing occupies **Dream Machine → PERCEIVE**.

A visibly distinct leader jet flies with visually identical escorts. The vulnerable relay is not a permanently marked aircraft. It is the escort **nearest to the leader while occupying the outside of the leader’s turn**.

The leader banks and leaves a curved flight trace. Escorts weave, cross and change distance, so the role moves from one aircraft to another without any aircraft changing appearance. The player must bind:

**leader’s turn → outside of that turn → nearest escort there → fire**

This is not odd-one-out detection. Correctness cannot be inferred from colour, fixed identity, screen side, altitude or one-object appearance.

### Combat and progression

1. Read the leader’s bank and curved trail.
2. Determine the outside of the turn.
3. Compare the escorts occupying that side.
4. Acquire the nearest outside escort.
5. Fire to sever the live relay.
6. Reacquire when the formation crosses or the leader reverses.
7. Sever enough relays to collapse the leader’s shield network.

Early encounters use fewer escorts and stronger guidance. The guide arc and label progressively disappear while the physical bank and trail remain. Escort count, crossing rate and relational switching speed increase. Switch hysteresis prevents ambiguous frame-by-frame flicker.

False shots are classified as **stale-role perseveration**, inside/outside reversal, outside-distance substitution, reference-object substitution, screen-position substitution or late relational acquisition. The game stores role switches, reacquisition latency, target stability, accuracy and error types locally. These are experimental gameplay measurements, not a validated clinical or IQ assessment.

## Become Reality Lab — Controlled as-if training

Become occupies **Dream Maker → BECOME**, replacing Metamorph while leaving the other eight portal positions intact.

Become is deliberately **zero-key and internet-only for scenario generation**. A player chooses **1, 3, 5, 10, or a custom number of scenarios**. Each scenario is generated remotely at the moment it is needed. The live path does not select a prewritten world and does not download a language model, model weights, WebGPU runtime or CPU/WASM inference stack into the browser.

The browser calls Dream Unity's CORS-enabled live proxy at `dream-unity-become-live.vercel.app`. The proxy then calls BlockRun's remote inference service server-to-server, avoiding BlockRun's lack of browser CORS without introducing a browser credential. The primary generator is **`nvidia/gpt-oss-120b`**; **`nvidia/step-3.7-flash`** and **`nvidia/mistral-nemotron`** are remote failover models. The browser requires **no API key, no account and no local model installation**.

The browser sends only compact live-generation context: summaries of recent generated worlds, numerical training performance and a session nonce. Personal life-transfer descriptions are not sent. The proxy constructs the prompt, validates the returned JSON, compares it against recent worlds using lexical similarity plus eight relational dimensions, and rejects/regenerates it when it is too similar. There is **no stored live fallback**: Become advances only after a genuinely live internet-generated scenario has been received and novelty-checked.

This proxy exists specifically because direct browser requests to the upstream model service are not CORS-readable. The architecture is therefore:

**GitHub Pages browser → Dream Unity zero-key proxy → live remote model → proxy validation/novelty rejection → generated world returned to browser.**

Each generated world trains **seventeen 10-second faculties** independently, followed immediately by a 1–10 self-score:

1. Sensory Presence
2. Object Tangibility
3. Spatial Embodiment
4. Atmospheric Presence
5. Kinaesthetic Motion
6. Attentional Immersion
7. Premise Acceptance
8. Experiential Conviction
9. Consequence Presence
10. Emotional Resonance
11. Physiological Resonance
12. Agency
13. Behavioural Authenticity
14. Identity Inhabitation
15. Premise Fidelity
16. Integrated Reality
17. Exit Control

A scenario report separates strong and weak faculties instead of collapsing everything into a vague “visualisation” score.

### Reality transfer

After the selected generated scenarios, the player defines:

- the most important current goal, dilemma, fear, decision or opportunity;
- an observable success point;
- one executable next physical action.

The game then runs eight additional 10-second drills: Success World, Success Embodiment, Lived Consequences, Identity Cause, Reverse Causal Bridge, Friction Inclusion, Motivational Transfer and Behavioural Transfer.

The session finishes with a **30-second state-entry** test. The player taps **ENTERED** only when sensory location, bodily presence, consequence and identity are simultaneously active. Entry speed is combined with a depth score so shallow speed is not rewarded.

The governing distinction is controlled as-if conviction, not literal confusion about reality. The player is repeatedly instructed to retain awareness that the simulation was chosen, include inconvenient constraints, stop if intensity becomes unhelpful, and complete a deliberate exit. It must not be used while driving or during hazardous activity.

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

### Become Reality Lab

- Use the on-screen controls on mouse, touch or keyboard.
- Each timer starts only after an explicit action.
- During a rating screen, press 1–9, or 0 for 10.
- Pause, restart, sound and return controls remain available in the shared header.

## Shared architecture

The nine games retain shared navigation, local best scores, responsive layouts, synthesized audio, capped rendering on lower-powered devices and suspension of the 3D overview while a game is active. The 3D/game layer requires no external game engine. **Become is the deliberate exception for inference:** its scenarios are generated by remote internet models through the Dream Unity proxy rather than by a downloadable browser model.

Key files:

- `main.js` — three-world 3D overview and portal interaction.
- `styles.css` — common Dream Unity and arcade styling.
- `become.css` — responsive Become interface and training readouts.
- `arcade.js` — versioned loader that assembles the base engine and isolated replacements.
- `arcade-parts/part-01.txt` … `part-05.txt` — original unified nine-game runtime.
- `arcade-parts/perceive-role-logic.txt` — testable relational-role geometry and diagnostics.
- `arcade-parts/perceive-aerial-01.txt` … `perceive-aerial-08.txt` — Parallax Wing combat, telemetry and rendering.
- `arcade-parts/become-lab-01.txt` — Become timers, scoring, transfer, entry-latency measurement and core rendering.
- `arcade-parts/become-live-02.txt` — zero-key browser dispatcher, live prefetch and error handling.
- `api/become-scenario.js` — CORS-enabled zero-key BlockRun proxy, remote model failover, validation and novelty rejection.
- `tests/role-drift.test.mjs` — deterministic relational-role and transformation tests.
- `tests/validate.mjs` — nine-portal compatibility, syntax, zero-key Become integration and runtime smoke validation.

## Validation and deployment

```bash
npm test
```

GitHub Actions validates every pull request. After a push to `main`, it waits for GitHub Pages, compares the live HTML, styling, loader and every active game chunk byte-for-byte against the validated source, checks the proxy's zero-credential identity, performs a browser-style CORS preflight, requests a real generated scenario with no key, validates every required scenario field and relational dimension, and only then records the deployment as verified-live.
