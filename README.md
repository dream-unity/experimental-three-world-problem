# Dream Unity — Experimental Three-World Problem

A visual-first simulation containing three coupled worlds and nine distinct arcade games:

1. **Dream Machine** — Perceive, Model, Predict.
2. **Dream Maker** — Intend, Act, Become.
3. **Dream World** — Matter, Structure, Emerge.

The main scene is a mathematically projected 3D triad. Hold and drag to orbit it, pinch or wheel to zoom, twist with two fingers to roll, and select a world to enter its internal triad. Selecting an internal label opens the corresponding game.

## The nine games and their cognitive roles

| Portal | Game | Distinct gameplay purpose |
|---|---|---|
| **PERCEIVE** | **Parallax Wing** | Perceive live relations among moving fighter formations and fire at the aircraft defined by the relation. |
| **MODEL** | **Model Forge** | Encode a hidden network and reconstruct its exact connection structure. |
| **PREDICT** | **Oracle Gates** | Extrapolate where a moving object will reappear after occlusion. |
| **INTEND** | **Vector Vow** | Aim, charge and commit a planned trajectory through moving geometry and ricochets. |
| **ACT** | **Impulse Run** | Convert perception into immediate movement under escalating speed and obstacle pressure. |
| **BECOME** | **Metamorph** | Transform between three operational forms to meet changing environmental demands. |
| **MATTER** | **Gravity Foundry** | Manipulate attraction to absorb required matter while rejecting destabilising particles. |
| **STRUCTURE** | **Lattice Lock** | Rotate interconnected tiles until a coherent energy pathway emerges. |
| **EMERGE** | **Genesis Bloom** | Place limited seeds so local interactions produce large cascading ecological effects. |

The games are intentionally non-interchangeable. **Model Forge** trains reconstruction, **Oracle Gates** trains forward extrapolation, and **Parallax Wing** now trains immediate relational seeing in a continuously visible, moving field.

## Parallax Wing — the PERCEIVE fighter game

Parallax Wing replaces Signal Veil while retaining the same `machine:0` portal, shared lifecycle and unified arcade interface.

The player flies a fighter, aims a pulse cannon and survives incoming fire. Enemy aircraft are visually identical; no colour or static side marks the correct target. The decisive aircraft is defined only by its relation to the rest of the moving formation.

The game generates eight progressively combined perceptual families:

- a symmetry-breaking aircraft among mirrored pairs;
- the causal source whose movement propagates through a squadron;
- an aircraft moving in counterphase to an otherwise synchronized formation;
- an aircraft preserving a constant relation to a moving beacon;
- a bridge connecting two moving formation clusters;
- an aircraft opposite a marker in a rotating local frame;
- the aircraft at the intersection of two moving sight-lines;
- compound topology-plus-phase relations at higher levels.

The relation remains visible while the player acts. There are no textual premises, picture-answer panels or hidden arbitrary answer tokens. The response is the targeting and firing action itself.

Correct acquisition destroys the formation, builds a focus streak and increases score. A false lock damages the fighter and records the specific perceptual error represented by that distractor. Failing to acquire the relation before the formation reaches the player is separately recorded as late relational acquisition.

### Anti-shortcut and assessment design

- target identity, absolute side, formation rotation and screen position vary each encounter;
- all aircraft share the same base appearance;
- assistance gradually reduces without removing the causal evidence;
- distractors embody specific errors rather than random alternatives;
- relation family, latency, false-lock type, firing accuracy and run outcomes are stored locally;
- combat pressure creates urgency, but success still depends on perceiving the relation rather than shooting everything.

## Shared arcade architecture

All nine games retain:

- touch, mouse and keyboard controls;
- persistent local best scores;
- scoring, lives/resources, combinations and progressive difficulty;
- pause, restart, sound and return-to-triad controls;
- responsive tablet and mobile layouts;
- shared particle, flash, shake and synthesized-audio feedback;
- capped pixel ratio and object counts on lower-powered hardware;
- suspension of the 3D overview while a game is active;
- same-origin, versioned and locally cached game chunks;
- no external game engine, font, model, analytics service or video asset.

## Parallax Wing controls

- **Touch/mouse:** drag to fly and aim; hold to fire.
- **Keyboard:** WASD or arrows move the fighter and sight; Space fires.
- Enemy fire can be dodged or destroyed through the sight.

## Validation

```bash
npm test
```

The repository test assembles the original five arcade chunks, injects the three Parallax Wing chunks inside the shared private runtime, syntax-checks the complete game engine and verifies nine-game compatibility, portal isolation, relation-family coverage, perceptual error topology, controls and static deployment references.

Serve over HTTP or deploy directly through GitHub Pages.
