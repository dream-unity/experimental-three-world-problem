# Dream Unity — Experimental Three-World Problem

A visual-first 3D portal containing nine distinct arcade games across three coupled worlds:

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
| **BECOME** | **Metamorph** | Change operational form to meet changing demands. |
| **MATTER** | **Gravity Foundry** | Manipulate attraction and material selection. |
| **STRUCTURE** | **Lattice Lock** | Construct coherent connectivity across a grid. |
| **EMERGE** | **Genesis Bloom** | Produce global cascades from local interactions. |

The games are intentionally non-interchangeable. Model Forge trains reconstruction, Oracle Gates trains forward extrapolation, and Parallax Wing trains direct perception of a relation that exists **now** and changes while the player acts.

## Parallax Wing — Relational Identity Drift

Parallax Wing occupies **Dream Machine → PERCEIVE**.

A visibly distinct leader jet flies with a formation of visually identical escorts. The vulnerable relay is not a permanently marked aircraft. It is a live role:

> **the escort currently nearest to the leader while occupying the outside of the leader’s turn**

The leader banks and leaves a curved flight trace. Its escorts weave, cross and change distance. As this happens, the vulnerable role moves from one escort to another without any aircraft changing appearance.

The player must therefore perceive:

**leader’s turn → outside of that turn → nearest escort there → fire**

This is not odd-one-out detection. No escort is visually unusual, and correctness cannot be inferred from colour, identity, fixed side, altitude or one-object appearance.

### Why it belongs to PERCEIVE

- The complete relation remains simultaneously visible.
- The player does not reconstruct a hidden network, which remains Model Forge’s role.
- The player does not calculate a future reappearance, which remains Oracle Gates’ role.
- The challenge is rapid binding of leader, turn direction, side and distance into one present relational role.
- When escorts cross or the leader reverses its bank, the role must be re-perceived immediately.

### Combat loop

1. Read the leader’s bank and curved trail.
2. Determine the outside of the turn.
3. Compare the distances of escorts occupying that side.
4. Acquire the nearest outside escort.
5. Fire to sever the relay.
6. The formation reorganises and the role moves.
7. Sever enough relays to collapse the leader’s shield network.

Correct fire removes the current relay, builds a focus streak and weakens the leader’s shield. Incorrect fire leaves the hostile relation intact and damages the player.

### Progressive difficulty

- Early encounters use four escorts, a fixed turn and a restrained outside-side arc.
- The arc and label progressively disappear while the leader’s physical bank and trail remain.
- Escort count, crossing rate and relational switching speed increase.
- From Level 3, the leader reverses its turn during the encounter.
- The system uses switch hysteresis so the role changes only after one escort is decisively closer, avoiding ambiguous frame-by-frame flicker.
- At advanced levels, the player must repeatedly reacquire the role under faster weaving and combat pressure.

### Diagnostic error topology

False shots are classified according to the relation the player appears to have used:

- **stale-role perseveration** — firing at the aircraft that held the role before the latest switch;
- **inside/outside reversal** — selecting the nearest escort on the inside of the turn;
- **outside-distance substitution** — selecting the correct side but not the nearest escort;
- **reference-object substitution** — firing at the leader rather than using it as the reference;
- **screen-position substitution** — treating absolute screen side as the rule;
- **late relational acquisition** — allowing the formation to break through before enough relays are severed.

The game stores role switches, reacquisition latency, target stability, firing accuracy and error types locally. These measurements are experimental gameplay telemetry, not a validated clinical or IQ assessment.

## Controls

- **Mouse:** move to aim; click to fire.
- **Touch:** drag to manoeuvre; tap to fire.
- **Keyboard:** WASD or arrows move the fighter and sight; Space fires.
- Enemy projectiles can be dodged or intercepted.

## Shared arcade architecture

All nine games retain:

- shared touch, mouse and keyboard input;
- local best scores;
- score, lives/resources, combinations and progressive difficulty;
- pause, restart, sound and return-to-triad controls;
- responsive tablet and mobile layouts;
- shared particles, flashes, shake and synthesized audio;
- capped rendering resolution and object counts on lower-powered devices;
- suspension of the 3D overview while a game is active;
- same-origin, versioned and locally cached game chunks;
- no external engine, model, font, analytics service or video asset.

## Architecture

- `main.js` — three-world 3D overview and portal interaction.
- `arcade.js` — versioned shared loader.
- `arcade-parts/part-01.txt` … `part-05.txt` — original unified nine-game runtime.
- `arcade-parts/perceive-role-logic.txt` — testable geometry and diagnostic classification for relational identity drift.
- `arcade-parts/perceive-aerial-01.txt` … `perceive-aerial-08.txt` — Parallax Wing fighter, formation, combat, telemetry and rendering.
- `tests/role-drift.test.mjs` — deterministic relational-role, transformation and diagnostic tests.
- `tests/validate.mjs` — nine-game compatibility, syntax, static integration and runtime smoke validation.

## Validation

```bash
npm test
```

GitHub Actions validates every pull request. After a merge to `main`, it waits for GitHub Pages, compares the live HTML, loader and every game chunk byte-for-byte against the validated source, and records a deployment receipt.
