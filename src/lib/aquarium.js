// Steering for the flood screen saver's tank.
//
// The swimmers used to be CSS keyframes crossing left to right, which meant
// every one of them travelled the same straight line forever. Free roaming,
// fish fleeing and sharks hunting are all about where everything else is right
// now, so it has to be a real update loop. Kept out of the component so it can
// be reasoned about — and tested — on its own.

const TAU = Math.PI * 2;

// Distances in pixels, speeds in pixels/second.
const RULES = {
  fish:   { speed: 62,  turn: 2.6, size: 22 },
  shark:  { speed: 74,  turn: 1.6, size: 54, chase: 260, chaseSpeed: 150, bite: 26 },
  turtle: { speed: 30,  turn: 1.1, size: 40 },
};
// A fish outruns a shark in a straight line and out-turns it easily; the shark
// wins by cutting the corner. Tuned for a kill every ten seconds or so — often
// enough to be worth watching, rare enough that the tank stays full.
const FLEE_RANGE = 240;   // how far a fish notices a shark
const FLEE_SPEED = 158;
const EDGE = 70;          // margin where the soft wall starts pushing back
const RESPAWN_MS = [4000, 9000];

const rand = (a, b) => a + Math.random() * (b - a);

function retarget(entity, bounds) {
  entity.tx = rand(EDGE, bounds.width - EDGE);
  entity.ty = rand(EDGE, bounds.height - EDGE);
  entity.retargetAt = rand(2600, 7000);
}

export function createTank(bounds, { fish = 10, sharks = 2, turtles = 3 } = {}) {
  const colors = ["#f9a825", "#ef6c54", "#ffd166", "#4dd0e1", "#f48fb1", "#aed581", "#ff8a65"];
  const entities = [];
  const add = (kind, i) => {
    const rule = RULES[kind];
    const angle = rand(0, TAU);
    const e = {
      id: `${kind}-${i}`,
      kind,
      x: rand(EDGE, bounds.width - EDGE),
      y: rand(EDGE, bounds.height - EDGE),
      vx: Math.cos(angle) * rule.speed,
      vy: Math.sin(angle) * rule.speed,
      // A little variety so nothing moves in lockstep.
      speed: rule.speed * rand(0.8, 1.2),
      size: kind === "fish" ? rule.size * rand(0.7, 1.35) : rule.size * rand(0.9, 1.1),
      color: colors[i % colors.length],
      hiddenUntil: 0,
    };
    retarget(e, bounds);
    entities.push(e);
  };
  for (let i = 0; i < fish; i++) add("fish", i);
  for (let i = 0; i < sharks; i++) add("shark", i);
  for (let i = 0; i < turtles; i++) add("turtle", i);
  return entities;
}

function nearest(from, list, maxDist) {
  let best = null;
  let bestDist = maxDist;
  for (const other of list) {
    if (other === from || other.hiddenUntil) continue;
    const d = Math.hypot(other.x - from.x, other.y - from.y);
    if (d < bestDist) { bestDist = d; best = other; }
  }
  return best ? { target: best, dist: bestDist } : null;
}

// Advances the tank by dt seconds. Mutates in place — this runs every frame, so
// it allocates nothing. Returns the fish eaten this frame, for the splash.
export function stepTank(entities, dt, bounds, elapsedMs) {
  const eaten = [];
  const fish = entities.filter((e) => e.kind === "fish" && !e.hiddenUntil);
  const sharks = entities.filter((e) => e.kind === "shark" && !e.hiddenUntil);

  for (const e of entities) {
    if (e.hiddenUntil) {
      if (elapsedMs < e.hiddenUntil) continue;
      // Back from being eaten: re-enter from a random edge.
      e.hiddenUntil = 0;
      const fromLeft = Math.random() < 0.5;
      e.x = fromLeft ? -40 : bounds.width + 40;
      e.y = rand(EDGE, bounds.height - EDGE);
      retarget(e, bounds);
    }

    const rule = RULES[e.kind];
    let speed = e.speed;
    let tx = e.tx;
    let ty = e.ty;

    if (e.kind === "shark") {
      const prey = nearest(e, fish, rule.chase);
      if (prey) {
        // Aim slightly ahead of the fish, or the shark forever trails it.
        tx = prey.target.x + prey.target.vx * 0.35;
        ty = prey.target.y + prey.target.vy * 0.35;
        speed = rule.chaseSpeed;
        if (prey.dist < rule.bite) {
          prey.target.hiddenUntil = elapsedMs + rand(RESPAWN_MS[0], RESPAWN_MS[1]);
          eaten.push({ id: prey.target.id, x: prey.target.x, y: prey.target.y });
        }
      }
    } else if (e.kind === "fish") {
      const threat = nearest(e, sharks, FLEE_RANGE);
      if (threat) {
        // Straight away from the shark, not to a fixed point.
        tx = e.x + (e.x - threat.target.x);
        ty = e.y + (e.y - threat.target.y);
        speed = FLEE_SPEED;
      }
    }

    e.retargetAt -= dt * 1000;
    if (e.retargetAt <= 0) retarget(e, bounds);

    // Steer toward the target, then let the soft walls bend it back inside.
    let dx = tx - e.x;
    let dy = ty - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    let desiredX = (dx / dist) * speed;
    let desiredY = (dy / dist) * speed;

    if (e.x < EDGE) desiredX += (EDGE - e.x) * 2.2;
    if (e.x > bounds.width - EDGE) desiredX -= (e.x - (bounds.width - EDGE)) * 2.2;
    if (e.y < EDGE) desiredY += (EDGE - e.y) * 2.2;
    if (e.y > bounds.height - EDGE) desiredY -= (e.y - (bounds.height - EDGE)) * 2.2;

    const turn = Math.min(1, rule.turn * dt);
    e.vx += (desiredX - e.vx) * turn;
    e.vy += (desiredY - e.vy) * turn;

    // Cap, so a stack of steering forces can't fling anything across the tank.
    const v = Math.hypot(e.vx, e.vy);
    const max = speed * 1.35;
    if (v > max) { e.vx = (e.vx / v) * max; e.vy = (e.vy / v) * max; }

    e.x += e.vx * dt;
    e.y += e.vy * dt;
    // Hard clamp as well as the soft wall: a resize can leave something outside.
    e.x = Math.max(-60, Math.min(bounds.width + 60, e.x));
    e.y = Math.max(-60, Math.min(bounds.height + 60, e.y));
  }

  return eaten;
}

// The sprites are drawn facing one way; this works out how to point them along
// their velocity. `facesRight` describes the artwork, not the swimmer.
export function spriteTransform(e, facesRight = false) {
  const angle = Math.atan2(e.vy, e.vx);
  const movingRight = Math.abs(angle) < Math.PI / 2;
  // A sprite is mirrored when it needs to face the way it is NOT drawn.
  const flip = movingRight === facesRight ? 1 : -1;
  // Mirroring happens before the rotation, so once mirrored the sprite's nose
  // already points along +x and the rotation is simply the heading.
  let rotate = movingRight ? angle : angle - Math.PI;
  // Keep it from swimming vertically enough to look like it is falling.
  rotate = Math.max(-0.7, Math.min(0.7, normalize(rotate)));
  // The trailing -50% centres the sprite on its position: percentages resolve
  // against the element's own box and apply before the rotation.
  return `translate(${e.x}px, ${e.y}px) rotate(${rotate}rad) scaleX(${flip}) translate(-50%, -50%)`;
}

function normalize(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}
