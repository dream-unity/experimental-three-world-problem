import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../arcade-parts/perceive-causal-logic.txt', import.meta.url), 'utf8');
const context = { Math, Map, Number, String };
vm.createContext(context);
vm.runInContext(`${source}\nthis.causalInterpositionState = causalInterpositionState; this.causalShotClassification = causalShotClassification;`, context);
const { causalInterpositionState, causalShotClassification } = context;

const anchorA = { id: 'a', x: -1, y: 0 };
const anchorB = { id: 'b', x: 1, y: 0 };
const candidates = [
  { id: 'between', x: 0.2, y: 0.025, alive: true },
  { id: 'outside', x: 1.35, y: 0.01, alive: true },
  { id: 'off-axis', x: -0.2, y: 0.31, alive: true },
  { id: 'endpoint', x: -0.89, y: 0.08, alive: true },
];

const open = causalInterpositionState(anchorA, anchorB, candidates, {
  lineThreshold: 0.08,
  compression: 0.03,
  requireCompression: true,
  compressionThreshold: 0.005,
});
assert.equal(open.geometricTargetId, 'between');
assert.equal(open.activeTargetId, 'between');
assert.equal(open.collinearOutsideId, 'outside');
assert.equal(open.betweenOffAxisId, 'off-axis');
assert.ok(open.compressionGate);

const expanding = causalInterpositionState(anchorA, anchorB, candidates, {
  lineThreshold: 0.08,
  compression: -0.03,
  requireCompression: true,
  compressionThreshold: 0.005,
});
assert.equal(expanding.geometricTargetId, 'between');
assert.equal(expanding.activeTargetId, null, 'between without compression must keep the shield closed');
assert.equal(expanding.compressionGate, false);

const baseOnly = causalInterpositionState(anchorA, anchorB, candidates, {
  lineThreshold: 0.08,
  compression: -0.03,
  requireCompression: false,
});
assert.equal(baseOnly.activeTargetId, 'between', 'early experiential levels must isolate the between relation');

const migratedCandidates = candidates.map((candidate) => ({ ...candidate }));
migratedCandidates.find((candidate) => candidate.id === 'between').y = 0.25;
migratedCandidates.find((candidate) => candidate.id === 'off-axis').y = 0.02;
const migrated = causalInterpositionState(anchorA, anchorB, migratedCandidates, { lineThreshold: 0.08 });
assert.equal(migrated.activeTargetId, 'off-axis', 'vulnerability must migrate with the live relation rather than identity');

const destroyed = migratedCandidates.map((candidate) => ({ ...candidate }));
destroyed.find((candidate) => candidate.id === 'off-axis').alive = false;
assert.notEqual(causalInterpositionState(anchorA, anchorB, destroyed, { lineThreshold: 0.08 }).activeTargetId, 'off-axis');

// Rotation and uniform scale preserve the relational answer.
const angle = 1.17;
const scale = 2.8;
const transform = ({ id, x, y, alive = true }) => ({
  id,
  alive,
  x: (x * Math.cos(angle) - y * Math.sin(angle)) * scale + 4.2,
  y: (x * Math.sin(angle) + y * Math.cos(angle)) * scale - 1.7,
});
const transformed = causalInterpositionState(
  transform(anchorA),
  transform(anchorB),
  candidates.map(transform),
  { lineThreshold: 0.08 * scale },
);
assert.equal(transformed.activeTargetId, 'between');

assert.equal(causalShotClassification({ shotId: 'between', state: open }), null);
assert.equal(causalShotClassification({ shotId: 'between', state: expanding }), 'compression-gate-omission');
assert.equal(causalShotClassification({ shotId: 'outside', state: open }), 'outside-segment-confusion');
assert.equal(causalShotClassification({ shotId: 'off-axis', state: open }), 'alignment-tolerance-confusion');
assert.equal(causalShotClassification({ shotId: 'a', state: open }), 'linked-anchor-substitution');
assert.equal(causalShotClassification({
  shotId: 'old-target',
  state: open,
  previousTargetId: 'old-target',
  secondsSinceMigration: 0.42,
}), 'stale-vulnerability-perseveration');
assert.equal(causalShotClassification({ shotId: null, state: open }), 'empty-space-shot');

console.log('Causal Interposition: if/then and if/not boundaries, compression composition, identity migration, transformation invariance and diagnostic errors validated.');
