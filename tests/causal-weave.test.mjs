import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../arcade-parts/perceive-role-logic.txt', import.meta.url), 'utf8');
const context = { Math, Map, Number, String };
vm.createContext(context);
vm.runInContext(`${source}\nthis.causalSegmentRelation=causalSegmentRelation;this.causalTriangleRelation=causalTriangleRelation;this.causalWeaveEvaluate=causalWeaveEvaluate;this.causalWeaveClassifyShot=causalWeaveClassifyShot;`, context);
const {
  causalSegmentRelation,
  causalTriangleRelation,
  causalWeaveEvaluate,
  causalWeaveClassifyShot,
} = context;

const anchorA = { id: 'a', rx: -0.3, ry: 0, vx: 0, vy: 0, alive: true };
const anchorB = { id: 'b', rx: 0.3, ry: 0, vx: 0, vy: 0, alive: true };
const relay = { id: 'r', rx: 0.02, ry: 0.01, vx: 0, vy: 0.18, alive: true };
const decoy = { id: 'd', rx: 0.4, ry: 0.01, vx: 0, vy: 0.18, alive: true };

const between = causalSegmentRelation(anchorA, anchorB, relay);
assert.equal(between.active, true, 'a moving relay between two anchors must activate the between relation');
assert.equal(causalSegmentRelation(anchorA, anchorB, decoy).active, false, 'crossing the line extension must not count as between');
assert.equal(causalSegmentRelation(anchorA, anchorB, { ...relay, ry: 0.08 }).active, false, 'being merely near the segment must not activate it');
assert.equal(causalSegmentRelation(anchorA, anchorB, { ...relay, vx: 0, vy: 0 }).active, false, 'static alignment must not substitute for crossing');

const betweenScene = {
  law: 'between',
  jets: [anchorA, anchorB, relay, decoy],
  roles: { anchorAId: 'a', anchorBId: 'b', relayId: 'r', decoyId: 'd' },
};
let evaluation = causalWeaveEvaluate(betweenScene);
assert.equal(evaluation.active, true);
assert.equal(evaluation.targetId, 'r', 'the between object itself becomes vulnerable');

const flowScene = { ...betweenScene, law: 'flow', flowDirection: 1 };
evaluation = causalWeaveEvaluate(flowScene);
assert.equal(evaluation.targetId, 'b', 'positive current makes the downstream B anchor vulnerable');
flowScene.flowDirection = -1;
assert.equal(causalWeaveEvaluate(flowScene).targetId, 'a', 'reversing current must reverse the vulnerable endpoint');

const anchorC = { id: 'c', rx: 0, ry: -0.32, vx: 0, vy: 0, alive: true };
const enclosedRelay = { id: 'r', rx: 0, ry: -0.09, vx: 0, vy: 0.16, alive: true };
const triangle = causalTriangleRelation(anchorA, anchorB, anchorC, enclosedRelay);
assert.equal(triangle.active, true, 'a relay clearly enclosed by a closed triangle must activate enclosure');
assert.equal(causalTriangleRelation(anchorA, anchorB, anchorC, { ...enclosedRelay, rx: 0.34 }).active, false, 'nearby but exterior position must not count as enclosed');
assert.equal(causalTriangleRelation(anchorA, anchorB, { ...anchorC, ry: -0.01 }, enclosedRelay).active, false, 'an open/collapsed triangle must not create enclosure');
const enclosureScene = {
  law: 'enclosure',
  jets: [anchorA, anchorB, anchorC, enclosedRelay, decoy],
  roles: { anchorAId: 'a', anchorBId: 'b', anchorCId: 'c', relayId: 'r', decoyId: 'd' },
};
assert.equal(causalWeaveEvaluate(enclosureScene).targetId, 'r');

// Translation, rotation and scale change appearance but not relational truth.
const transform = (jet, angle, scale, tx, ty) => ({
  ...jet,
  rx: (jet.rx * Math.cos(angle) - jet.ry * Math.sin(angle)) * scale + tx,
  ry: (jet.rx * Math.sin(angle) + jet.ry * Math.cos(angle)) * scale + ty,
  vx: (jet.vx * Math.cos(angle) - jet.vy * Math.sin(angle)) * scale,
  vy: (jet.vx * Math.sin(angle) + jet.vy * Math.cos(angle)) * scale,
});
const transformedBetween = {
  ...betweenScene,
  jets: betweenScene.jets.map((jet) => transform(jet, 1.19, 1.65, 2.7, -1.4)),
};
assert.equal(causalWeaveEvaluate(transformedBetween).targetId, 'r', 'the rule must survive rotation, scale and translation');

assert.equal(causalWeaveClassifyShot({ shotId: 'r', evaluation: causalWeaveEvaluate(betweenScene), scene: betweenScene }), null);
assert.equal(causalWeaveClassifyShot({ shotId: 'a', evaluation: causalWeaveEvaluate(betweenScene), scene: betweenScene }), 'anchor-for-between-object-substitution');
assert.equal(causalWeaveClassifyShot({ shotId: 'r', evaluation: causalWeaveEvaluate({ ...betweenScene, jets: [anchorA, anchorB, { ...relay, ry: 0.12 }, decoy] }), scene: betweenScene }), 'near-but-not-between');
assert.equal(causalWeaveClassifyShot({ shotId: 'r', evaluation: causalWeaveEvaluate({ ...flowScene, flowDirection: 1 }), scene: { ...flowScene, flowDirection: 1 } }), 'relay-for-downstream-anchor-substitution');
assert.equal(causalWeaveClassifyShot({ shotId: 'a', evaluation: causalWeaveEvaluate({ ...flowScene, flowDirection: 1 }), scene: { ...flowScene, flowDirection: 1 } }), 'wrong-flow-endpoint');
assert.equal(causalWeaveClassifyShot({ shotId: 'c', evaluation: causalWeaveEvaluate(enclosureScene), scene: enclosureScene }), 'boundary-for-enclosed-object-substitution');
assert.equal(causalWeaveClassifyShot({
  shotId: 'old',
  evaluation: { active: true, targetId: 'new', law: 'between' },
  scene: betweenScene,
  previousTargetId: 'old',
  secondsSinceTargetChange: 0.4,
}), 'stale-causal-target');

console.log('Causal Weave: positive/negative contrasts, three laws, transformed transfer and diagnostic errors validated.');
