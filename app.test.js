"use strict";

const assert = require("node:assert/strict");
const { calculate, defaults } = require("./app.js");

const noLoss = calculate({
  ...defaults,
  loadCurrentMa: 0,
  commonFeedResistanceMohm: 0
});
assert.equal(noLoss.topVoltage, defaults.sourceVoltage);
assert.equal(noLoss.lowerVoltage, defaults.sourceVoltage);

const twoLoads = calculate({
  ...defaults,
  sourceVoltage: 5,
  stripCount: 1,
  loadCount: 2,
  loadCurrentMa: 1000,
  pitchMm: 1000,
  topOffsetMm: 0,
  traceWidthMm: 1,
  copperThicknessUm: 1000,
  parallelLayers: 1,
  copperTemperatureC: 20,
  commonFeedResistanceMohm: 0
});
assert.ok(Math.abs(twoLoads.resistancePerPitch - 0.01724) < 1e-12);
assert.equal(twoLoads.pcbLengthMm, 2000);
assert.ok(Math.abs(twoLoads.lowerVoltage - (5 - 2 * 0.01724)) < 1e-12);
assert.equal(twoLoads.profile[0].currentAfterLoad, 1);
assert.equal(twoLoads.profile[1].currentAfterLoad, 0);

const fourStrips = calculate({
  ...defaults,
  stripCount: 4,
  loadCount: 10,
  loadCurrentMa: 100,
  commonFeedResistanceMohm: 10
});
assert.ok(Math.abs(fourStrips.panelCurrent - 4) < 1e-12);
assert.ok(Math.abs(fourStrips.commonFeedDrop - 0.04) < 1e-12);

assert.throws(
  () => calculate({ ...defaults, traceWidthMm: 0 }),
  /Trace width/
);

console.log("All calculator tests passed.");
