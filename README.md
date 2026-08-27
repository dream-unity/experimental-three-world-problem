# Dream Unity — Experimental Three-World Problem

A visual-first, mobile-compatible 3D portal containing nine distinct arcade experiences across three coupled worlds:

1. **Dream Machine** — Perceive, Model, Predict.
2. **Dream Maker** — Intend, Act, Become.
3. **Dream World** — Matter, Structure, Emerge.

The overview can be orbited by mouse or touch. Selecting a world exposes its internal triad; selecting an internal label opens the corresponding game.

## Nine-game cognitive division of labour

| Portal | Game | Primary operation |
|---|---|---|
| **PERCEIVE** | **Fighter Jet** | Identify which fighter currently occupies a continuously changing relational role. |
| **MODEL** | **Model Forge** | Encode and reconstruct a hidden network. |
| **PREDICT** | **Oracle Gates** | Extrapolate motion through an occluded interval. |
| **INTEND** | **Vector Vow** | Select, charge and commit a planned trajectory. |
| **ACT** | **Impulse Run** | Convert perception into immediate movement under speed pressure. |
| **BECOME** | **Social Agency Lab** | Inhabit highly distinct social worlds while differentiating self, other, interaction pattern, action and feedback. |
| **MATTER** | **Gravity Foundry** | Manipulate attraction and material selection. |
| **STRUCTURE** | **Lattice Lock** | Construct coherent connectivity across a grid. |
| **EMERGE** | **Genesis Bloom** | Produce global cascades from local interactions. |

## Fighter Jet — Relational Identity Drift

Fighter Jet occupies **Dream Machine → PERCEIVE**.

A visibly distinct leader jet flies with visually identical escorts joined by a changing network. Each encounter samples a hidden position-invariant graph rule. The player watches marked worked examples, infers which topological role is being selected, then transfers that rule to unmarked networks with new aircraft identities, connections and layouts.

No rule text or outside-side cue is shown during transfer. A correct answer replaces the complete formation while preserving the hidden relation, so success requires applying an abstract relation across changed instances rather than tracking a rewarded aircraft. Target selection follows current geometry without persistence hysteresis, and a wrong answer locks firing before another relational commitment can be made.

Difficulty changes relational load rather than removing the reasoning requirement. Levels 1–2 infer first-order network roles such as hub, triangle anchor, widest two-step reach or strongest neighbourhood from four examples. Levels 3–6 infer composed roles such as the least-connected neighbour of the hub, the most-connected node two steps from it, or a critical bridge. Levels 7–10 follow longer chains through hubs, bridges, two-step neighbourhoods and structural analogues. Higher levels also increase transfer count, distractors and presentation speed; no active rule uses screen position, turn side, geometric distance or axis alignment.

Correctness cannot be inferred reliably from colour, fixed identity, screen position, proximity, altitude, odd-one-out appearance or rapid sweep firing. The task combines graph-role induction, multi-hop composition and analogical transfer. These are experimental gameplay measurements, not a validated clinical or IQ assessment.

## Become — Social Agency Lab

Become occupies **Dream Maker → BECOME**, replacing Metamorph while leaving the other eight portal positions intact.

The current design treats agency in social situations as a perspective-integration problem rather than a simple confidence or compliance problem. Every generated world contains another autonomous perspective and repeatedly trains the following loop:

**SELF → OTHER → OUTSIDE → ACTION → FEEDBACK**

- **Self:** notice bodily state, motive, need, value, boundary and self-protective bias.
- **Other:** hold at least two plausible models of the other person rather than converting an inference into fact.
- **Outside:** model the interaction pattern that both people are jointly producing.
- **Action:** choose a behaviour that integrates self-awareness and empathy without self-erasure.
- **Feedback:** imagine how the action may land, then remain willing to update the model from the actual response.

Empathy is implemented as **evidence-sensitive model flexibility**. It does not mean mind-reading, automatic agreement, rescuing, forced forgiveness, surrendering standards, or losing one’s own centre. Many scenarios specifically train compassionate boundaries, respectful dissent, receiving criticism without collapse, giving feedback without humiliation, accountability without self-destruction, and care without takeover.

### Forty social architectures

The social layer contains forty deliberately different relational architectures, including:

- mentoring someone who has stopped speaking;
- challenging a respected authority;
- negotiating shared credit;
- listening without prematurely solving;
- setting a compassionate boundary;
- receiving and giving difficult feedback;
- owning unintended impact;
- receiving an apology at one’s own pace;
- mediating two conflicting perspectives;
- protecting dissent inside group consensus;
- cross-cultural and cross-language interpretation;
- nonverbal co-creation;
- correcting a public misinterpretation;
- entering a child’s learning model;
- protecting an older person’s autonomy;
- recognising hidden access constraints;
- allocating scarce resources fairly;
- negotiating different risk tolerances;
- resisting projection into ambiguous text;
- redistributing invisible burdens across a remote team;
- recognising excluded contribution;
- detecting pressured consent;
- staying present with grief;
- retaining humanity inside competition;
- helping a stranger without taking over;
- accepting that art can land differently from its intention;
- inviting a newcomer without demanding assimilation;
- breaking a mutual-deference loop;
- slowing rumour contagion;
- holding multiple family memories;
- de-tokenising a person treated as a group representative;
- interrupting overfunctioning/underfunctioning loops;
- respecting refused help;
- differentiating care from envy;
- receiving sincere praise;
- playful co-creation without domination;
- challenging unfairness inside one’s own coalition;
- rebuilding community trust through process.

### Joint max-distance generation

Scenario novelty is selected jointly across two independent spaces:

1. **Twenty-six world families**, such as orchestra conducting, miniature clockwork navigation, night-market hosting, forest acoustics, colour-language first contact, planetarium teaching, kinetic sculpture, radio drama, ceramics, low-gravity botany, historical reconstruction and other phenomenologically distinct environments.
2. **Forty social architectures**, each with a distinct relational topology, power structure, empathy operation, self-blindspot, agency mode, value conflict, communication channel, emotional field and boundary problem.

The generator measures candidates across **twenty-nine structural novelty axes**:

- 13 world axes: family, world class, scale, setting, role, goal, pressure, body dynamics, decision structure, social structure, tone, sensory channel and time pattern;
- 16 social axes: profile, topology, power, relationship, empathy operation, self-blindspot, agency mode, value conflict, communication mode, emotional field, reciprocity, perspective depth, time horizon, social scale, repair mode and boundary mode.

Selection uses a **joint maximin objective**. It does not choose the candidate with the best average novelty. It chooses the candidate whose *closest* resemblance to anything already selected or recently encountered is still as distant as possible.

Within one session:

- a world family cannot repeat;
- a social profile cannot repeat;
- empathy operations and agency modes are strongly diversified;
- the complete session is planned before scenario one begins.

Abstract world and social signatures are remembered locally across sessions, so immediately restarting the lab does not simply recycle the same families. Personal Life Transfer text is never placed in this novelty memory.

### Loading architecture

BECOME’s active runtime is entirely local and synchronous:

**core training lifecycle → world diversity space → social-agency maximin planner → prewarmed session queue**

No cloud dispatcher, remote model request, API credential, browser model download, WebGPU model or CPU/WASM inference engine is loaded on the active path. The setup screen schedules a background prewarm, and pressing **Enter Social Agency Session** consumes that prepared queue when available. All scenarios are therefore ready before scenario one opens, and moving between scenarios requires no network generation wait.

The repository retains older experimental cloud files for historical development reference, but `arcade.js` does not fetch or execute them.

### Seventeen social faculties

Each scenario runs seventeen ten-second faculties, followed by an immediate 1–10 self-score:

1. **Social Evidence** — perceive social cues without treating motive as known.
2. **Shared-World Tangibility** — make the common environment materially constraining for both people.
3. **Self-Location** — remain embodied in one’s own perspective while modelling another.
4. **Relational Atmosphere** — hold two emotional worlds and the field between them.
5. **Embodied Interaction** — feel how posture, timing, distance and action alter relation.
6. **Relational Attention** — hold self, other and interaction pattern simultaneously.
7. **Perspective Plurality** — accept that one’s own view is partial while retaining boundaries.
8. **Other-Mind Modelling** — make multiple hypotheses credible without mind-reading.
9. **Reciprocal Consequence** — feel effects on self, other and future interaction.
10. **Emotional Differentiation** — distinguish one’s emotion from inferred emotion.
11. **Self-Signal Awareness** — detect how physiology biases interpretation and action.
12. **Relational Agency** — choose from integrated perspectives rather than merely react.
13. **Non-Performative Empathy** — avoid socially idealised, rescuing or self-erasing empathy.
14. **Agentic Self-Awareness** — remain open to another mind without losing one’s own centre.
15. **Independent-Mind Fidelity** — preserve the other person as an autonomous centre of experience.
16. **Multi-Perspective Integration** — combine self, other, system, boundary and action.
17. **Exit + Epistemic Reset** — terminate the simulation and release imagined certainty about real people.

### Reality transfer

After the selected generated scenarios, the player defines:

- the most important current goal, dilemma, fear, decision or opportunity;
- an observable success point;
- one executable next physical action.

The game then runs eight additional ten-second transfer drills and a thirty-second state-entry test. Personal transfer wording remains in active page memory only; numerical performance may be stored locally.

The governing distinction remains controlled as-if conviction, not literal confusion about reality. The player retains awareness that the simulation was chosen, preserves inconvenient constraints, stops if intensity becomes unhelpful and completes a deliberate exit. The lab must not be used while driving or during hazardous activity.

## Controls

### Dream Unity overview

- **Unity Oracle:** the central orange Unity core greets each arrival; tap the core or its **UNITY** label to grant microphone access and answer it.
- **Mouse or touch drag:** orbit the three-world structure.
- **Pinch or wheel:** zoom.
- **Two-finger twist:** roll.
- **Tap a world, then an internal title:** open its game.

### Fighter Jet

- **Mouse:** move to aim; click to fire.
- **Touch:** drag to manoeuvre; tap to fire.
- **Keyboard:** WASD or arrows move; Space fires.

### Become Social Agency Lab

- Use the on-screen controls on mouse, touch or keyboard.
- Each timer starts only after an explicit action.
- During a rating screen, press 1–9, or 0 for 10.
- Pause, restart, sound and return controls remain available in the shared header.

## Key files

- `main.js` — three-world 3D overview and portal interaction.
- `styles.css` — common Dream Unity and arcade styling.
- `become.css` — responsive Become interface and training readouts.
- `arcade.js` — lean versioned loader for the active game layers.
- `arcade-parts/part-01.txt` … `part-05.txt` — shared nine-game runtime.
- `arcade-parts/perceive-role-logic.txt` — relational-role geometry and diagnostics.
- `arcade-parts/perceive-aerial-01.txt` … `perceive-aerial-08.txt` — Fighter Jet combat, telemetry and rendering.
- `arcade-parts/become-lab-01.txt` — Become timers, scoring, transfer, entry-latency measurement and rendering.
- `arcade-parts/become-diversity-09.txt` — twenty-six orthogonal world families and world-distance primitives.
- `arcade-parts/become-social-agency-10.txt` — forty social architectures, joint maximin selection, social prompts and prewarming.
- `tests/role-drift.test.mjs` — deterministic relational-role tests.
- `tests/validate.mjs` — syntax, nine-portal compatibility, speed, diversity, empathy and cross-session anti-repetition tests.

## Validation and deployment

```bash
npm test
```

GitHub Actions validates every push, waits for GitHub Pages to match the tested source byte-for-byte, verifies that the lean loader excludes the obsolete cloud path, checks the active social-agency markers and writes a machine-readable deployment receipt.

This is experimental cognitive-training gameplay, not a validated clinical, neurological or psychometric intervention.
