// ============================================================
//  SPRING PHYSICS ENGINE
// ============================================================
function Spring(opts) {
  this.value = opts.value || 0;
  this.target = opts.target || 0;
  this.velocity = 0;
  this.stiffness = opts.stiffness || 120;
  this.damping = opts.damping || 14;
  this.mass = opts.mass || 1;
}
Spring.prototype.update = function(dt) {
  var force = -this.stiffness * (this.value - this.target);
  var dampForce = -this.damping * this.velocity;
  var accel = (force + dampForce) / this.mass;
  this.velocity += accel * dt;
  this.value += this.velocity * dt;
};
Spring.prototype.set = function(v) { this.target = v; };
Spring.prototype.snap = function(v) { this.value = v; this.target = v; this.velocity = 0; };

function makeSpring(preset) {
  var presets = {
    bouncy:  { stiffness: 100, damping: 10, mass: 1 },
    gentle:  { stiffness: 30,  damping: 8,  mass: 1.2 },
    snappy:  { stiffness: 300, damping: 20, mass: 0.8 },
    wobbly:  { stiffness: 80,  damping: 6,  mass: 1.5 },
  };
  var p = presets[preset] || presets.bouncy;
  return new Spring(p);
}
