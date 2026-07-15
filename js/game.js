import * as THREE from 'three';

const SAVE_KEY = 'grand-theft-biryani-save-v1';
const SETTINGS_KEY = 'grand-theft-biryani-settings-v1';
const WORLD_LIMIT = 116;
const canvas = document.querySelector('#game-canvas');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb9c7c8);
scene.fog = new THREE.Fog(0xb9c7c8, 90, 235);
const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 500);
const clock = new THREE.Clock();

const $ = (selector) => document.querySelector(selector);
const ui = {
  loading: $('#loading-screen'), loadingBar: $('#loading-bar'), loadingCopy: $('#loading-copy'),
  menu: $('#main-menu'), missionMenu: $('#mission-menu'), settingsMenu: $('#settings-menu'), pauseMenu: $('#pause-menu'),
  hud: $('#hud'), continueBtn: $('#continue-btn'), objective: $('#mission-objective'), interaction: $('#interaction-prompt'),
  toast: $('#toast'), money: $('#money'), healthFill: $('#health-fill'), wanted: $('#wanted'), minimap: $('#minimap'),
};

const state = {
  running: false, paused: false, started: false, health: 100, money: 250, wanted: 0,
  stage: 0, parcel: false, completed: false, inVehicle: false,
  cameraYaw: Math.PI, cameraPitch: 0.28, sensitivity: 0.75,
  traffic: true, pedestrians: true,
};

const keys = new Set();
const colliders = [];
const traffic = [];
const pedestrians = [];
const markers = {};
let player;
let playerAuto;
let currentInteraction = null;
let dragging = false;
let lastPointer = { x: 0, y: 0 };
let toastTimer;

const mat = (color, roughness = 0.9, extras = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extras });
const materials = {
  road: mat(0x4c4944, 1), line: mat(0xc9be8e, 1), pavement: mat(0x918273, 1), sand: mat(0xc7aa78, 1),
  stone: mat(0xd6c2a0), trim: mat(0xb69468), dark: mat(0x28241f), green: mat(0x3f6653), blue: mat(0x4d6e80),
  red: mat(0x99513d), yellow: mat(0xd6a037), white: mat(0xe8dfcf), black: mat(0x171817),
};

function addMesh(geometry, material, position = [0, 0, 0], cast = true) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(...position);
  object.castShadow = cast;
  object.receiveShadow = true;
  scene.add(object);
  return object;
}

function addCollider(object, shrink = 0) {
  object.updateMatrixWorld(true);
  colliders.push(new THREE.Box3().setFromObject(object).expandByScalar(shrink));
}

function createRoads() {
  addMesh(new THREE.PlaneGeometry(280, 280), materials.sand, [0, -0.15, 0], false).rotation.x = -Math.PI / 2;
  addMesh(new THREE.BoxGeometry(250, 0.12, 20), materials.road, [0, 0, 0], false);
  addMesh(new THREE.BoxGeometry(20, 0.12, 250), materials.road, [0, 0, 0], false);
  addMesh(new THREE.BoxGeometry(74, 0.1, 12), materials.road, [-67, 0, 49], false);
  addMesh(new THREE.BoxGeometry(12, 0.1, 67), materials.road, [49, 0, 65], false);
  addMesh(new THREE.BoxGeometry(66, 0.1, 11), materials.road, [76, 0, -52], false);
  addMesh(new THREE.BoxGeometry(250, 0.24, 4), materials.pavement, [0, 0.04, 12], false);
  addMesh(new THREE.BoxGeometry(250, 0.24, 4), materials.pavement, [0, 0.04, -12], false);
  addMesh(new THREE.BoxGeometry(4, 0.24, 250), materials.pavement, [12, 0.04, 0], false);
  addMesh(new THREE.BoxGeometry(4, 0.24, 250), materials.pavement, [-12, 0.04, 0], false);
  for (let n = -110; n <= 110; n += 12) {
    addMesh(new THREE.BoxGeometry(5.5, 0.04, 0.18), materials.line, [n, 0.09, 0], false);
    addMesh(new THREE.BoxGeometry(0.18, 0.04, 5.5), materials.line, [0, 0.09, n], false);
  }
}

function createCharminar() {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(22, 18, 22), materials.stone);
  base.position.y = 9; base.castShadow = true; group.add(base);
  const balcony = new THREE.Mesh(new THREE.BoxGeometry(25, 1.1, 25), materials.trim);
  balcony.position.y = 17; balcony.castShadow = true; group.add(balcony);

  [[-10.5,-10.5],[10.5,-10.5],[-10.5,10.5],[10.5,10.5]].forEach(([x,z]) => {
    const tower = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.65, 28, 14), materials.stone);
    shaft.position.y = 14; shaft.castShadow = true; tower.add(shaft);
    [8,17,25].forEach(y => { const ring = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.1, 0.8, 16), materials.trim); ring.position.y = y; tower.add(ring); });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.7, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), materials.stone);
    dome.position.y = 29.1; dome.castShadow = true; tower.add(dome);
    const finial = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 2.5, 8), materials.trim);
    finial.position.y = 32; tower.add(finial);
    tower.position.set(x, 0, z); group.add(tower);
  });

  const openingMat = mat(0x4a4033, 1);
  [[0,7,11.01,0],[0,7,-11.01,0],[11.01,7,0,Math.PI/2],[-11.01,7,0,Math.PI/2]].forEach(([x,y,z,rotation]) => {
    const arch = new THREE.Mesh(new THREE.TorusGeometry(4.1, 1.65, 10, 22, Math.PI), openingMat);
    arch.position.set(x, y + 1.5, z); arch.rotation.set(0, rotation, Math.PI); group.add(arch);
    const opening = new THREE.Mesh(new THREE.BoxGeometry(rotation ? 2 : 7, 6, rotation ? 7 : 2), openingMat);
    opening.position.set(x, y - 1.4, z); group.add(opening);
  });
  group.position.y = 0.1; scene.add(group); addCollider(base, -1.5);
}

function createBuilding(x, z, width, depth, height, material, frontNorth = false) {
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  body.position.set(x, height / 2, z); body.castShadow = true; body.receiveShadow = true; scene.add(body); addCollider(body, -0.12);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(width + 0.5, 0.45, depth + 0.5), materials.dark);
  roof.position.set(x, height + 0.22, z); roof.castShadow = true; scene.add(roof);
  const frontZ = frontNorth ? z + depth / 2 + 0.03 : z - depth / 2 - 0.03;
  const signColors = [0xa83a2e, 0x30674f, 0xc28f2c];
  const signColor = signColors[Math.abs(Math.round(x + z)) % signColors.length];
  const sign = new THREE.Mesh(new THREE.BoxGeometry(Math.min(width * 0.72, 8), 1.35, 0.22), mat(signColor, 0.8, { emissive: signColor, emissiveIntensity: 0.08 }));
  sign.position.set(x, Math.min(3.4, height - 1), frontZ); scene.add(sign);
  const glass = mat(0x9db6b5, 0.45, { emissive: 0x506b69, emissiveIntensity: 0.16 });
  for (let floor = 4.8; floor < height - 1; floor += 3.1) {
    for (let offset = -width * 0.28; offset <= width * 0.28; offset += Math.max(2.6, width * 0.28)) {
      const window = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 0.13), glass);
      window.position.set(x + offset, floor, frontZ); scene.add(window);
    }
  }
}

function createNeighbourhood() {
  const palette = [materials.red, materials.green, materials.blue, materials.yellow, materials.stone];
  const blocks = [
    [-39,-26,18,15,11],[-61,-26,20,15,16],[-86,-27,24,16,13],[38,-28,16,17,13],[59,-29,19,18,10],[83,-29,22,18,17],
    [-35,29,16,17,14],[-56,29,18,17,11],[-79,30,22,19,15],[35,29,16,17,12],[56,29,18,17,16],[80,30,23,18,11],
    [-29,59,18,22,12],[-53,63,24,22,17],[-83,62,28,24,13],[29,61,18,24,15],[56,67,23,27,19],[87,65,25,26,14],
    [-31,-61,18,24,15],[-56,-66,24,26,12],[-86,-68,27,27,18],[31,-62,18,25,12],[57,-68,24,28,16],[88,-67,27,27,13],
  ];
  blocks.forEach((block, index) => createBuilding(...block, palette[index % palette.length], index % 2 === 1));

  for (let i = 0; i < 7; i += 1) {
    const stall = addMesh(new THREE.BoxGeometry(5.2, 3.2, 4.3), [materials.red, materials.green, materials.yellow][i % 3], [-25 - i * 8.2, 1.6, -15]);
    addCollider(stall, -0.15);
    addMesh(new THREE.BoxGeometry(5.8, 0.18, 2.8), [materials.yellow, materials.red, materials.green][i % 3], [-25 - i * 8.2, 3.35, -16.6]);
  }

  const garage = addMesh(new THREE.BoxGeometry(20, 8, 15), materials.green, [49, 4, 83]); addCollider(garage, -0.2);
  addMesh(new THREE.BoxGeometry(10, 5, 0.25), materials.dark, [49, 2.5, 75.48]);
  const safeHouse = addMesh(new THREE.BoxGeometry(15, 10, 14), materials.blue, [-52, 5, 85]); addCollider(safeHouse, -0.15);
}

function createTree(x, z, scale = 1) {
  addMesh(new THREE.CylinderGeometry(0.35 * scale, 0.5 * scale, 4 * scale, 8), mat(0x6f4d33), [x, 2 * scale, z]);
  addMesh(new THREE.SphereGeometry(2 * scale, 10, 8), mat(0x4e714c), [x, 5 * scale, z]);
}

function createStreetProps() {
  [[-18,20],[18,-21],[-19,-46],[19,47],[-68,45],[47,43],[73,-47]].forEach(([x,z], index) => createTree(x, z, 0.85 + (index % 3) * 0.1));
  for (let n = -90; n <= 90; n += 30) {
    const pole = addMesh(new THREE.CylinderGeometry(0.14, 0.18, 8, 8), materials.dark, [n, 4, 14]);
    const lamp = addMesh(new THREE.BoxGeometry(1.1, 0.35, 0.55), mat(0xffd98c, 0.5, { emissive: 0xffb84e, emissiveIntensity: 0.5 }), [n + 0.4, 7.7, 14]);
    pole.castShadow = lamp.castShadow = true;
  }
}

function createPerson() {
  const group = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.05, 4, 8), materials.red); torso.position.y = 1.35; torso.castShadow = true; group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 10), mat(0x8c5e43)); head.position.y = 2.55; head.castShadow = true; group.add(head);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1, 0.45), materials.dark); legs.position.y = 0.55; legs.castShadow = true; group.add(legs);
  return group;
}

function createAuto(color = 0x2d6b4b) {
  const group = new THREE.Group();
  const bodyMaterial = mat(color, 0.75);
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.25, 1.25, 3.4), bodyMaterial); body.position.y = 1.05; body.castShadow = true; group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.05, 1.45, 1.9), materials.black); cabin.position.set(0, 2, -0.25); cabin.castShadow = true; group.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.18, 2.2), materials.yellow); roof.position.set(0, 2.78, -0.25); group.add(roof);
  [[-1.05,0.52,-1.15],[1.05,0.52,-1.15],[0,0.52,1.25]].forEach(([x,y,z]) => {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.22, 12), materials.black); wheel.rotation.z = Math.PI / 2; wheel.position.set(x,y,z); group.add(wheel);
  });
  return group;
}

function createCharactersAndTraffic() {
  player = createPerson(); player.position.set(-45, 0, 72); scene.add(player);
  playerAuto = createAuto(); playerAuto.position.set(-41, 0, 67); playerAuto.rotation.y = Math.PI; playerAuto.userData.speed = 0; scene.add(playerAuto);

  const routes = [
    { axis:'x', fixed:4.5, min:-112, max:112, dir:1 }, { axis:'x', fixed:-4.5, min:-112, max:112, dir:-1 },
    { axis:'z', fixed:4.5, min:-112, max:112, dir:1 }, { axis:'z', fixed:-4.5, min:-112, max:112, dir:-1 },
  ];
  routes.forEach((route, index) => {
    const vehicle = createAuto([0xaa3d32,0x2f5c78,0xd1a12f,0x537050][index]);
    vehicle.position.set(route.axis === 'x' ? -80 + index * 32 : route.fixed, 0, route.axis === 'z' ? -70 + index * 29 : route.fixed);
    vehicle.userData.route = route; scene.add(vehicle); traffic.push(vehicle);
  });

  const spots = [[-28,-16,'x'],[-63,14,'x'],[17,31,'z'],[14,-63,'z'],[45,14,'x'],[-14,75,'z'],[78,-14,'x'],[-17,-88,'z']];
  spots.forEach(([x,z,axis], index) => {
    const person = createPerson(); person.position.set(x,0,z); person.userData = { x, z, axis, phase:index * 0.8, range:4 + index % 3, speed:0.45 + index * 0.025 };
    scene.add(person); pedestrians.push(person);
  });
}

function createMarker(color, x, z) {
  const marker = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.34, 10, 28), mat(color, 0.45, { emissive: color, emissiveIntensity: 0.55 }));
  marker.rotation.x = Math.PI / 2; marker.position.set(x, 0.65, z); marker.userData.baseY = 0.65; scene.add(marker); return marker;
}

function createMission() {
  markers.pickup = createMarker(0xd99125, -68, -17);
  markers.delivery = createMarker(0x54b888, 49, 73);
  markers.delivery.visible = false;
}

function createWorld() {
  scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x6d5035, 2.15));
  const sun = new THREE.DirectionalLight(0xffe1aa, 3.1); sun.position.set(-65,95,45); sun.castShadow = true; sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera, { left:-150, right:150, top:150, bottom:-150 }); sun.shadow.bias = -0.00025; scene.add(sun);
  createRoads(); createCharminar(); createNeighbourhood(); createStreetProps(); createCharactersAndTraffic(); createMission();
}

function collidesAt(position) {
  const box = new THREE.Box3(new THREE.Vector3(position.x - 0.62, 0, position.z - 0.62), new THREE.Vector3(position.x + 0.62, 2.8, position.z + 0.62));
  return colliders.some(collider => collider.intersectsBox(box));
}

function updatePlayer(dt) {
  const forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
  const sideways = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
  if (!forward && !sideways) return;
  const direction = new THREE.Vector3(sideways, 0, forward).normalize().applyAxisAngle(new THREE.Vector3(0,1,0), state.cameraYaw);
  const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 10.5 : 6.2;
  const next = player.position.clone().addScaledVector(direction, speed * dt);
  next.x = THREE.MathUtils.clamp(next.x, -WORLD_LIMIT, WORLD_LIMIT); next.z = THREE.MathUtils.clamp(next.z, -WORLD_LIMIT, WORLD_LIMIT);
  if (!collidesAt(next)) player.position.copy(next);
  player.rotation.y = Math.atan2(direction.x, direction.z);
}

function updateVehicle(dt) {
  const throttle = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
  const steering = Number(keys.has('KeyA') || keys.has('ArrowLeft')) - Number(keys.has('KeyD') || keys.has('ArrowRight'));
  playerAuto.userData.speed = THREE.MathUtils.lerp(playerAuto.userData.speed, throttle * (throttle < 0 ? 8 : 16), Math.min(1, dt * 3));
  playerAuto.rotation.y += steering * dt * 1.6 * Math.sign(playerAuto.userData.speed || 1);
  const movement = new THREE.Vector3(Math.sin(playerAuto.rotation.y), 0, Math.cos(playerAuto.rotation.y)).multiplyScalar(playerAuto.userData.speed * dt);
  const next = playerAuto.position.clone().add(movement);
  if (Math.abs(next.x) < WORLD_LIMIT && Math.abs(next.z) < WORLD_LIMIT && !collidesAt(next)) playerAuto.position.copy(next);
  else playerAuto.userData.speed *= -0.2;
}

function updateCamera(dt) {
  const subject = state.inVehicle ? playerAuto : player;
  const distance = state.inVehicle ? 10.5 : 7.2;
  const height = state.inVehicle ? 5.2 : 4.2;
  const offset = new THREE.Vector3(Math.sin(state.cameraYaw) * distance, height + state.cameraPitch * 6, Math.cos(state.cameraYaw) * distance);
  const target = subject.position.clone().add(new THREE.Vector3(0, state.inVehicle ? 1.6 : 1.7, 0));
  camera.position.lerp(target.clone().add(offset), 1 - Math.pow(0.001, dt)); camera.lookAt(target);
}

function updateTraffic(dt) {
  traffic.forEach((vehicle, index) => {
    vehicle.visible = state.traffic; if (!state.traffic) return;
    const route = vehicle.userData.route; const speed = 6.2 + index * 0.8;
    if (route.axis === 'x') {
      vehicle.position.x += route.dir * speed * dt; vehicle.position.z = route.fixed; vehicle.rotation.y = route.dir > 0 ? Math.PI/2 : -Math.PI/2;
      if (vehicle.position.x > route.max) vehicle.position.x = route.min; if (vehicle.position.x < route.min) vehicle.position.x = route.max;
    } else {
      vehicle.position.z += route.dir * speed * dt; vehicle.position.x = route.fixed; vehicle.rotation.y = route.dir > 0 ? 0 : Math.PI;
      if (vehicle.position.z > route.max) vehicle.position.z = route.min; if (vehicle.position.z < route.min) vehicle.position.z = route.max;
    }
  });
}

function updatePedestrians(elapsed) {
  pedestrians.forEach(person => {
    person.visible = state.pedestrians; if (!state.pedestrians) return;
    const value = Math.sin(elapsed * person.userData.speed + person.userData.phase) * person.userData.range;
    const sign = Math.cos(elapsed * person.userData.speed + person.userData.phase);
    if (person.userData.axis === 'x') { person.position.x = person.userData.x + value; person.rotation.y = sign > 0 ? Math.PI/2 : -Math.PI/2; }
    else { person.position.z = person.userData.z + value; person.rotation.y = sign > 0 ? 0 : Math.PI; }
  });
}

function updateMarkers(elapsed) {
  Object.values(markers).forEach((marker, index) => { marker.rotation.z = elapsed * 0.65 + index; marker.position.y = marker.userData.baseY + Math.sin(elapsed * 2 + index) * 0.12; });
}

function updateInteractions() {
  const subject = state.inVehicle ? playerAuto : player;
  const candidates = [];
  if (!state.inVehicle) candidates.push({ type:'vehicle', distance:player.position.distanceTo(playerAuto.position) });
  if (state.stage === 0 && !state.completed) candidates.push({ type:'pickup', distance:subject.position.distanceTo(markers.pickup.position) });
  if (state.stage === 1 && !state.completed) candidates.push({ type:'delivery', distance:subject.position.distanceTo(markers.delivery.position) });
  if (state.inVehicle) candidates.push({ type:'exit', distance:0 });
  currentInteraction = candidates.filter(item => item.distance < (item.type === 'delivery' ? 4.2 : 3.4)).sort((a,b) => a.distance - b.distance)[0] || null;
  ui.interaction.classList.toggle('hidden', !currentInteraction);
  if (currentInteraction) {
    const labels = { vehicle:'Press <kbd>E</kbd> to enter auto', pickup:'Press <kbd>E</kbd> to collect parcel', delivery:'Press <kbd>E</kbd> to deliver parcel', exit:'Press <kbd>E</kbd> to exit auto' };
    ui.interaction.innerHTML = labels[currentInteraction.type];
  }
}

function interact() {
  if (!currentInteraction || state.paused) return;
  if (currentInteraction.type === 'vehicle') { state.inVehicle = true; player.visible = false; showToast('Auto-rickshaw acquired'); }
  if (currentInteraction.type === 'exit') {
    const side = new THREE.Vector3(Math.cos(playerAuto.rotation.y),0,-Math.sin(playerAuto.rotation.y)).multiplyScalar(2.3);
    player.position.copy(playerAuto.position).add(side); player.visible = true; state.inVehicle = false; showToast('Exited vehicle');
  }
  if (currentInteraction.type === 'pickup') {
    state.parcel = true; state.stage = 1; state.money += 50; markers.pickup.visible = false; markers.delivery.visible = true;
    updateHud(); updateObjective(); saveGame(); showToast('Parcel collected — ₹50 advance');
  }
  if (currentInteraction.type === 'delivery') {
    state.completed = true; state.stage = 2; state.money += 500; markers.delivery.visible = false;
    updateHud(); updateObjective(); saveGame(); showToast('Mission passed — ₹500');
  }
}

function updateObjective() {
  ui.objective.textContent = state.stage === 0 ? 'Head to the biryani shop.' : state.stage === 1 ? 'Deliver the parcel to the garage.' : 'Mission complete. Explore Old City.';
}

function updateHud() {
  ui.money.textContent = `₹ ${state.money.toLocaleString('en-IN')}`;
  ui.healthFill.style.width = `${state.health}%`;
  ui.wanted.textContent = `${'★ '.repeat(state.wanted)}${'☆ '.repeat(3 - state.wanted)}`.trim();
}

function showToast(message) {
  clearTimeout(toastTimer); ui.toast.textContent = message; ui.toast.classList.add('visible');
  toastTimer = setTimeout(() => ui.toast.classList.remove('visible'), 2400);
}

function saveGame() {
  const subject = state.inVehicle ? playerAuto : player;
  localStorage.setItem(SAVE_KEY, JSON.stringify({ health:state.health, money:state.money, wanted:state.wanted, stage:state.stage, parcel:state.parcel, completed:state.completed, x:subject.position.x, z:subject.position.z }));
}

function loadGame() {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY)); if (!data) return false;
    Object.assign(state, { health:data.health ?? 100, money:data.money ?? 250, wanted:data.wanted ?? 0, stage:data.stage ?? 0, parcel:Boolean(data.parcel), completed:Boolean(data.completed), inVehicle:false });
    player.position.set(data.x ?? -45, 0, data.z ?? 72); player.visible = true;
    markers.pickup.visible = state.stage === 0 && !state.completed; markers.delivery.visible = state.stage === 1 && !state.completed; return true;
  } catch { return false; }
}

function resetMission() {
  Object.assign(state, { health:100, money:250, wanted:0, stage:0, parcel:false, completed:false, inVehicle:false });
  player.position.set(-45,0,72); player.visible = true; playerAuto.position.set(-41,0,67); playerAuto.rotation.y = Math.PI; playerAuto.userData.speed = 0;
  markers.pickup.visible = true; markers.delivery.visible = false; updateHud(); updateObjective();
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ sensitivity:state.sensitivity, traffic:state.traffic, pedestrians:state.pedestrians }));
}

function loadSettings() {
  try {
    const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)); if (settings) Object.assign(state, settings);
  } catch { /* keep defaults */ }
  $('#sensitivity').value = state.sensitivity; $('#traffic-toggle').checked = state.traffic; $('#pedestrian-toggle').checked = state.pedestrians;
}

function hideScreens() { document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('visible')); }
function showMenu() {
  state.running = false; state.paused = false; hideScreens(); ui.menu.classList.add('visible'); ui.hud.classList.add('hidden');
  ui.continueBtn.disabled = !localStorage.getItem(SAVE_KEY);
}

function startGame(mode) {
  hideScreens(); ui.hud.classList.remove('hidden'); state.running = true; state.paused = false; state.started = true;
  if (mode === 'new') { resetMission(); saveGame(); } else if (!loadGame()) resetMission();
  updateHud(); updateObjective();
}

function setPaused(paused) {
  if (!state.started || !state.running) return;
  state.paused = paused; ui.pauseMenu.classList.toggle('visible', paused);
}

function drawMinimap() {
  const ctx = ui.minimap.getContext('2d'); const width = ui.minimap.width; const height = ui.minimap.height; const scale = width / (WORLD_LIMIT * 2.25);
  const point = (x,z) => [width/2 + x*scale, height/2 + z*scale];
  ctx.clearRect(0,0,width,height); ctx.fillStyle = 'rgba(24,22,19,.9)'; ctx.fillRect(0,0,width,height);
  ctx.fillStyle = '#625f58'; ctx.fillRect(0,height/2-11,width,22); ctx.fillRect(width/2-11,0,22,height);
  ctx.fillStyle = '#d2bc94'; ctx.fillRect(width/2-10,height/2-10,20,20);
  const subject = state.inVehicle ? playerAuto : player; const [px,py] = point(subject.position.x,subject.position.z);
  ctx.save(); ctx.translate(px,py); ctx.rotate(-(state.inVehicle ? playerAuto.rotation.y : player.rotation.y)); ctx.fillStyle = '#f5efe0';
  ctx.beginPath(); ctx.moveTo(0,-7); ctx.lineTo(5,6); ctx.lineTo(-5,6); ctx.closePath(); ctx.fill(); ctx.restore();
  const active = state.stage === 0 ? markers.pickup : state.stage === 1 ? markers.delivery : null;
  if (active?.visible) { const [mx,my] = point(active.position.x,active.position.z); ctx.strokeStyle = state.stage === 0 ? '#d99125' : '#54b888'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(mx,my,7,0,Math.PI*2); ctx.stroke(); }
}

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false); camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
}

function bindEvents() {
  window.addEventListener('resize', resize);
  window.addEventListener('keydown', event => { keys.add(event.code); if (event.code === 'KeyE' && !event.repeat) interact(); if (event.code === 'Escape' && !event.repeat && state.started) setPaused(!state.paused); });
  window.addEventListener('keyup', event => keys.delete(event.code));
  window.addEventListener('blur', () => { keys.clear(); if (state.running) setPaused(true); });
  canvas.addEventListener('pointerdown', event => { dragging = true; lastPointer = { x:event.clientX, y:event.clientY }; });
  window.addEventListener('pointerup', () => { dragging = false; });
  window.addEventListener('pointermove', event => {
    if (!dragging || !state.running) return;
    const dx = event.clientX - lastPointer.x; const dy = event.clientY - lastPointer.y; lastPointer = { x:event.clientX, y:event.clientY };
    state.cameraYaw -= dx * 0.0042 * state.sensitivity; state.cameraPitch = THREE.MathUtils.clamp(state.cameraPitch + dy * 0.0028 * state.sensitivity, -0.12, 0.72);
  });
  canvas.addEventListener('wheel', event => { state.cameraPitch = THREE.MathUtils.clamp(state.cameraPitch + Math.sign(event.deltaY) * 0.04, -0.12, 0.72); }, { passive:true });

  ui.continueBtn.addEventListener('click', () => startGame('continue'));
  $('#new-game-btn').addEventListener('click', () => startGame('new'));
  $('#mission-select-btn').addEventListener('click', () => { hideScreens(); ui.missionMenu.classList.add('visible'); });
  $('#settings-btn').addEventListener('click', () => { hideScreens(); ui.settingsMenu.classList.add('visible'); });
  $('#reset-btn').addEventListener('click', () => { if (confirm('Reset all Grand Theft Biryani progress?')) { localStorage.removeItem(SAVE_KEY); showMenu(); } });
  $('#mission-one-btn').addEventListener('click', () => startGame('new'));
  $('#mission-back-btn').addEventListener('click', showMenu);
  $('#settings-back-btn').addEventListener('click', () => { saveSettings(); showMenu(); });
  $('#resume-btn').addEventListener('click', () => setPaused(false));
  $('#restart-mission-btn').addEventListener('click', () => { resetMission(); setPaused(false); showToast('Mission restarted'); });
  $('#save-quit-btn').addEventListener('click', () => { saveGame(); showMenu(); });
  $('#sensitivity').addEventListener('input', event => { state.sensitivity = Number(event.target.value); });
  $('#traffic-toggle').addEventListener('change', event => { state.traffic = event.target.checked; });
  $('#pedestrian-toggle').addEventListener('change', event => { state.pedestrians = event.target.checked; });
}

function animate() {
  requestAnimationFrame(animate); const dt = Math.min(clock.getDelta(), 0.05); const elapsed = clock.elapsedTime;
  if (state.running && !state.paused) {
    if (state.inVehicle) updateVehicle(dt); else updatePlayer(dt);
    updateTraffic(dt); updatePedestrians(elapsed); updateMarkers(elapsed); updateInteractions(); drawMinimap();
  }
  updateCamera(dt || 0.016); renderer.render(scene, camera);
}

async function boot() {
  const stages = [['Laying out the Old City roads…',18],['Building Charminar…',42],['Opening the bazaar…',66],['Starting the auto-rickshaws…',84],['Serving the biryani…',100]];
  loadSettings(); createWorld(); bindEvents(); resize(); updateCamera(0.016); animate();
  for (const [copy, progress] of stages) { ui.loadingCopy.textContent = copy; ui.loadingBar.style.width = `${progress}%`; await new Promise(resolve => setTimeout(resolve, 220)); }
  showMenu();
}

boot().catch(error => { console.error(error); ui.loadingCopy.textContent = 'The game could not start. Refresh and try again.'; });
