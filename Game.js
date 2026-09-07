/* ============================================================
   CUBE RUNNER 3D — game.js
   - 3 carriles (izquierda, centro, derecha)
   - FLECHAS ← → / A D para cambiar de carril
   - ESPACIO / ↑ para saltar
   - El cubito se inclina al cambiar de carril
   - Solo rota al saltar
   ============================================================ */

'use strict';

const canvas  = document.getElementById('c');
const overlay = document.getElementById('overlay');
const btn     = document.getElementById('btn');
const msgEl   = document.getElementById('msg');
const scEl    = document.getElementById('sc');
const bsEl    = document.getElementById('bs');

const wrapper = document.getElementById('game-wrapper');
let W = wrapper.clientWidth, H = wrapper.clientHeight;
canvas.width  = W;
canvas.height = H;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(W, H);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07071a);
scene.fog = new THREE.Fog(0x07071a, 22, 42);

const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 100);
camera.position.set(0, 4.0, 10);
camera.lookAt(0, 0.5, 0);

function onResize() {
  W = wrapper.clientWidth;
  H = wrapper.clientHeight;
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  renderer.setSize(W, H);
}
window.addEventListener('resize', onResize);

scene.add(new THREE.AmbientLight(0x334466, 0.9));

const sun = new THREE.DirectionalLight(0xffffff, 1.3);
sun.position.set(5, 12, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { near:0.5, far:50, left:-14, right:14, top:14, bottom:-14 });
scene.add(sun);

const fillLight = new THREE.PointLight(0x7c3aed, 1.8, 24);
fillLight.position.set(-4, 5, 4);
scene.add(fillLight);

const GROUND_Y   = -0.5;
const LANE_W     = 2.2;
const LANES      = [-LANE_W, 0, LANE_W];
const GROUND_LEN = 80;

(function makeGround() {
  const totalW = LANE_W * 2 + 1.5;
  const geo  = new THREE.BoxGeometry(totalW, 0.2, GROUND_LEN);
  const mat  = new THREE.MeshLambertMaterial({ color: 0x1a1740 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, GROUND_Y, -GROUND_LEN / 2 + 14);
  mesh.receiveShadow = true;
  scene.add(mesh);

  for (let i = 0; i < 2; i++) {
    const lg    = new THREE.BoxGeometry(0.06, 0.22, GROUND_LEN);
    const lm    = new THREE.MeshBasicMaterial({ color: 0x3b1f8c });
    const lmesh = new THREE.Mesh(lg, lm);
    lmesh.position.set(-LANE_W / 2 + i * LANE_W, GROUND_Y + 0.11, mesh.position.z);
    scene.add(lmesh);
  }

  for (const side of [-1, 1]) {
    const eg    = new THREE.BoxGeometry(0.35, 0.6, GROUND_LEN);
    const em    = new THREE.MeshLambertMaterial({ color: 0x2d2668 });
    const emesh = new THREE.Mesh(eg, em);
    emesh.position.set(side * (LANE_W + 0.9), GROUND_Y, mesh.position.z);
    scene.add(emesh);
  }
})();

(function makeStars() {
  const verts = [];
  for (let i = 0; i < 900; i++)
    verts.push((Math.random()-0.5)*120, Math.random()*28+2, -Math.random()*70);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color:0xffffff, size:0.07, transparent:true, opacity:0.7 })));
})();

const PLAYER_SIZE    = 0.72;
const PLAYER_FLOOR_Y = GROUND_Y + PLAYER_SIZE / 2;

const playerGeo = new THREE.BoxGeometry(PLAYER_SIZE, PLAYER_SIZE, PLAYER_SIZE);
const playerMat = new THREE.MeshLambertMaterial({ color: 0xa78bfa, emissive: 0x4c1d95, emissiveIntensity: 0.45 });
const player    = new THREE.Mesh(playerGeo, playerMat);
player.castShadow = true;
scene.add(player);

const playerGlow = new THREE.PointLight(0xa78bfa, 1.1, 4.5);
scene.add(playerGlow);

let alive = false, score = 0, best = 0;
let speed = 0.14, tick = 0, spawnTimer = 0, spawnInterval = 70;

let currentLane  = 1;
let targetX      = LANES[1];
const LANE_SPEED = 0.18;

let isJumping = false, jumpVY = 0;
const JUMP_FORCE     = 0.20;
const GRAVITY        = 0.013;
const JUMP_ROT_SPEED = 0.14;

const obstacles = [];
const obstacleMats = [
  new THREE.MeshLambertMaterial({ color: 0xf43f5e, emissive: 0x7f1d1d, emissiveIntensity: 0.5 }),
  new THREE.MeshLambertMaterial({ color: 0xfbbf24, emissive: 0x78350f, emissiveIntensity: 0.5 }),
  new THREE.MeshLambertMaterial({ color: 0x34d399, emissive: 0x064e3b, emissiveIntensity: 0.5 }),
  new THREE.MeshLambertMaterial({ color: 0x60a5fa, emissive: 0x1e3a5f, emissiveIntensity: 0.5 }),
];

function spawnObstacle() {
  const numBlocked = Math.random() < 0.25 ? 2 : 1;
  const pool = [0, 1, 2];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const mat = obstacleMats[Math.floor(Math.random() * obstacleMats.length)];
  const h   = 0.55 + Math.random() * 0.85;
  const w   = 0.55 + Math.random() * 0.35;
  pool.slice(0, numBlocked).forEach(lane => {
    const geo  = new THREE.BoxGeometry(w, h, w);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.position.set(LANES[lane], GROUND_Y + h / 2, -26);
    scene.add(mesh);
    obstacles.push({ mesh, h, w });
  });
}

const decors = [];
function spawnDecor() {
  const side  = Math.random() < 0.5 ? -LANE_W - 1.1 : LANE_W + 1.1;
  const isGem = Math.random() < 0.5;
  let mesh;
  if (isGem) {
    const geo = new THREE.OctahedronGeometry(0.2);
    const mat = new THREE.MeshLambertMaterial({ color: 0x818cf8, emissive: 0x312e81, emissiveIntensity: 0.8 });
    mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(side, GROUND_Y + 0.8 + Math.random() * 1.2, -26);
  } else {
    const geo = new THREE.CylinderGeometry(0.08, 0.13, 1.5, 7);
    const mat = new THREE.MeshLambertMaterial({ color: 0x4338ca, emissive: 0x1e1b4b, emissiveIntensity: 0.35 });
    mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(side, GROUND_Y + 0.75, -26);
  }
  scene.add(mesh);
  decors.push({ mesh, isGem });
}

function checkCollision(ob) {
  const margin = 0.06;
  const pr     = PLAYER_SIZE / 2 - margin;
  return (
    Math.abs(player.position.x - ob.mesh.position.x) < pr + ob.w / 2 &&
    Math.abs(player.position.y - ob.mesh.position.y) < pr + ob.h / 2 &&
    Math.abs(player.position.z - ob.mesh.position.z) < pr + ob.w / 2
  );
}

function jump() {
  if (!alive || isJumping) return;
  isJumping = true;
  jumpVY    = JUMP_FORCE;
}

function moveLeft() {
  if (!alive || currentLane <= 0) return;
  currentLane--;
  targetX = LANES[currentLane];
}

function moveRight() {
  if (!alive || currentLane >= 2) return;
  currentLane++;
  targetX = LANES[currentLane];
}

function gameOver() {
  alive = false;
  if (score > best) { best = score; bsEl.textContent = best; }
  msgEl.textContent = 'Puntaje: ' + score + '  —  ¡Inténtalo de nuevo!';
  btn.textContent   = '▶ JUGAR DE NUEVO';
  overlay.style.display = 'flex';
}

function resetGame() {
  obstacles.forEach(o => scene.remove(o.mesh));
  decors.forEach(d   => scene.remove(d.mesh));
  obstacles.length = 0;
  decors.length    = 0;

  score = 0; tick = 0; spawnTimer = 0;
  spawnInterval = 70; speed = 0.14;
  currentLane = 1;
  targetX     = LANES[1];

  player.position.set(LANES[1], PLAYER_FLOOR_Y, 6);
  player.rotation.set(0, 0, 0);
  isJumping = false;
  jumpVY    = 0;

  scEl.textContent = '0';
  overlay.style.display = 'none';
  alive = true;
}

btn.addEventListener('click', resetGame);
canvas.addEventListener('click', jump);

let touchStartX = 0, touchStartY = 0;
canvas.addEventListener('touchstart', e => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}, { passive: true });
canvas.addEventListener('touchend', e => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  if (Math.abs(dx) > Math.abs(dy)) {
    if (dx > 20) moveRight(); else if (dx < -20) moveLeft();
  } else {
    if (dy < -20) jump();
  }
}, { passive: true });

document.addEventListener('keydown', e => {
  switch (e.code) {
    case 'Space':      e.preventDefault(); jump();       break;
    case 'ArrowUp':    e.preventDefault(); jump();       break;
    case 'ArrowLeft':  e.preventDefault(); moveLeft();   break;
    case 'ArrowRight': e.preventDefault(); moveRight();  break;
    case 'KeyA':       moveLeft();   break;
    case 'KeyD':       moveRight();  break;
  }
});

let lastTime = 0;
function animate(timestamp) {
  requestAnimationFrame(animate);
  const dt = Math.min((timestamp - lastTime) / 16.67, 3);
  lastTime = timestamp;

  if (!alive) { renderer.render(scene, camera); return; }

  tick++;
  score = Math.floor(tick / 4);
  scEl.textContent = score;
  speed         = 0.14 + score * 0.00035;
  spawnInterval = Math.max(36, 70 - score * 0.09);

  // ── Movimiento lateral suave ──────────────────────────
  const lerpF = 1 - Math.pow(1 - LANE_SPEED, dt);
  player.position.x += (targetX - player.position.x) * lerpF;

  // Inclinación lateral (roll) proporcional a cuánto falta llegar
  const lateralDiff = targetX - player.position.x;
  const tiltTarget  = -lateralDiff * 0.38;
  player.rotation.z += (tiltTarget - player.rotation.z) * lerpF;

  // ── Salto ─────────────────────────────────────────────
  if (isJumping) {
    player.position.y += jumpVY * dt;
    jumpVY -= GRAVITY * dt;
    player.rotation.x += JUMP_ROT_SPEED * dt;
    if (player.position.y <= PLAYER_FLOOR_Y) {
      player.position.y = PLAYER_FLOOR_Y;
      player.rotation.x = Math.round(player.rotation.x / (Math.PI / 2)) * (Math.PI / 2);
      isJumping = false;
      jumpVY    = 0;
    }
  }

  // ── Spawn ─────────────────────────────────────────────
  spawnTimer += dt;
  if (spawnTimer >= spawnInterval) {
    spawnTimer = 0;
    spawnObstacle();
    if (Math.random() < 0.4) spawnDecor();
  }

  // ── Obstáculos ────────────────────────────────────────
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const ob = obstacles[i];
    ob.mesh.position.z += speed * dt;
    if (checkCollision(ob)) { gameOver(); return; }
    if (ob.mesh.position.z > 13) { scene.remove(ob.mesh); obstacles.splice(i, 1); }
  }

  // ── Decoraciones ──────────────────────────────────────
  for (let i = decors.length - 1; i >= 0; i--) {
    const d = decors[i];
    d.mesh.position.z += speed * dt;
    if (d.isGem) d.mesh.rotation.y += 0.06 * dt;
    if (d.mesh.position.z > 14) { scene.remove(d.mesh); decors.splice(i, 1); }
  }

  playerGlow.position.copy(player.position);
  playerGlow.position.y += 0.7;
  fillLight.position.x = Math.sin(timestamp * 0.0005) * 6;

  renderer.render(scene, camera);
}

requestAnimationFrame(animate);