import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const logic = readFileSync(new URL('../arcade-parts/perceive-role-logic.txt', import.meta.url), 'utf8');
const context = { Math, Map, Number, String };
vm.createContext(context);
vm.runInContext(`${logic}\nthis.roleDriftGeometry = roleDriftGeometry; this.roleDriftClassifyShot = roleDriftClassifyShot; this.roleGraphSelect = roleGraphSelect; this.roleGraphRank = roleGraphRank; this.rules = ROLE_DRIFT_RULES;`, context);
const { roleDriftGeometry, roleDriftClassifyShot, roleGraphSelect, roleGraphRank, rules } = context;

const formation = [
  { id: 'left-near', rx: -0.18, ry: 0.02, alive: true },
  { id: 'left-far', rx: -0.32, ry: -0.02, alive: true },
  { id: 'right-near', rx: 0.14, ry: 0.01, alive: true },
  { id: 'right-far', rx: 0.3, ry: 0.04, alive: true },
];

// A leader turning right has its outside on the left.
const rightTurn = roleDriftGeometry(formation, [-1, 0]);
assert.equal(rightTurn.targetId, 'left-near');
assert.equal(rightTurn.insideNearestId, 'right-near');
assert.ok(rightTurn.margin > 0);

// Reversing the leader's turn reverses the relational side and changes identity.
const leftTurn = roleDriftGeometry(formation, [1, 0]);
assert.equal(leftTurn.targetId, 'right-near');
assert.notEqual(leftTurn.targetId, rightTurn.targetId);

// The role migrates when two same-side escorts exchange relative distance.
const crossed = formation.map((escort) => ({ ...escort }));
crossed.find((escort) => escort.id === 'left-far').rx = -0.11;
const afterCross = roleDriftGeometry(crossed, [-1, 0]);
assert.equal(afterCross.targetId, 'left-far');

// Destroyed aircraft are excluded rather than remaining a memorised answer.
const removed = crossed.map((escort) => ({ ...escort }));
removed.find((escort) => escort.id === 'left-far').alive = false;
assert.equal(roleDriftGeometry(removed, [-1, 0]).targetId, 'left-near');

// The relation is rotation-equivariant: rotating formation and reference axis preserves identity.
const angle = Math.PI * 0.63;
const rotate = ([x, y]) => [
  x * Math.cos(angle) - y * Math.sin(angle),
  x * Math.sin(angle) + y * Math.cos(angle),
];
const rotatedFormation = formation.map((escort) => {
  const [rx, ry] = rotate([escort.rx, escort.ry]);
  return { ...escort, rx, ry };
});
const rotatedAxis = rotate([-1, 0]);
assert.equal(roleDriftGeometry(rotatedFormation, rotatedAxis, { yScale: 1 }).targetId, 'left-near');

// Diagnostics identify which mistaken relation was followed.
assert.equal(roleDriftClassifyShot({
  shotId: 'left-near',
  currentTargetId: rightTurn.targetId,
  geometry: rightTurn,
}), null);
assert.equal(roleDriftClassifyShot({
  shotId: 'right-near',
  currentTargetId: rightTurn.targetId,
  geometry: rightTurn,
}), 'inside-outside-reversal');
assert.equal(roleDriftClassifyShot({
  shotId: 'left-far',
  currentTargetId: rightTurn.targetId,
  geometry: rightTurn,
}), 'outside-distance-substitution');
assert.equal(roleDriftClassifyShot({
  shotId: 'left-near',
  currentTargetId: leftTurn.targetId,
  previousTargetId: 'left-near',
  secondsSinceSwitch: 0.42,
  geometry: leftTurn,
}), 'stale-role-perseveration');
assert.equal(roleDriftClassifyShot({
  shotId: 'leader',
  leaderId: 'leader',
  currentTargetId: rightTurn.targetId,
  geometry: rightTurn,
}), 'reference-object-substitution');
assert.equal(roleDriftClassifyShot({
  shotId: 'right-far',
  currentTargetId: rightTurn.targetId,
  geometry: rightTurn,
}), 'screen-position-substitution');

// A fallback remains unique when every aircraft is briefly near the dividing axis.
const nearAxis = [
  { id: 'a', rx: -0.003, ry: 0.08, alive: true },
  { id: 'b', rx: 0.004, ry: 0.12, alive: true },
  { id: 'c', rx: 0.001, ry: 0.2, alive: true },
];
const fallback = roleDriftGeometry(nearAxis, [1, 0], { threshold: 0.02 });
assert.ok(fallback.targetId);
assert.equal(new Set(fallback.outside.map((metric) => metric.id)).size, fallback.outside.length);

// Active rules depend only on graph topology. Screen coordinates can be
// changed arbitrarily without changing the selected relational role.
assert.equal(rules.length, 12);
const byId = Object.fromEntries(rules.map(rule => [rule.id, rule]));
const graph = [
  {id:'a',links:['b','c','d','e'],alive:true,rx:-.4,ry:.2},
  {id:'b',links:['a','c'],alive:true,rx:.3,ry:-.1},
  {id:'c',links:['a','b'],alive:true,rx:-.2,ry:-.3},
  {id:'d',links:['a','e','f'],alive:true,rx:.1,ry:.4},
  {id:'e',links:['a','d'],alive:true,rx:.4,ry:.1},
  {id:'f',links:['d'],alive:true,rx:-.1,ry:.1},
];
assert.equal(roleGraphSelect(graph,byId['network-hub']).id,'a');
const relocated=graph.map((node,index)=>({...node,rx:Math.sin(index*2.1),ry:Math.cos(index*1.7)}));
for(const rule of rules)assert.equal(roleGraphSelect(relocated,rule)?.id,roleGraphSelect(graph,rule)?.id,`${rule.id} must ignore spatial layout`);
for(const rule of rules)assert.ok(roleGraphRank(graph,rule).length,`${rule.id} must rank a graph role`);
assert.deepEqual([...new Set(rules.map(rule => rule.complexity))], [1, 2, 3]);

console.log('Fighter Jet relations: legacy geometry diagnostics plus position-invariant graph roles and three complexity tiers validated.');
