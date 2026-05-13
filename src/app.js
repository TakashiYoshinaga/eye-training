import * as THREE from "three";
import { VRButton } from "three/addons/webxr/VRButton.js";
import { XRControllerModelFactory } from "three/addons/webxr/XRControllerModelFactory.js";

const ROOM = { width: 6, height: 5, depth: 34 };
const LANE_Z_MIN = -1;
const LANE_Z_MAX = -31;
const LANES = [-2, 0, 2];
const LANDOLT_DIAMETER = 0.075;
const TRAINING_SECONDS = 180;
const DIRECTIONS = ["up", "right", "down", "left"];
const KEY_TO_DIR = new Map([
  ["ArrowUp", "up"],
  ["KeyW", "up"],
  ["ArrowRight", "right"],
  ["KeyD", "right"],
  ["ArrowDown", "down"],
  ["KeyS", "down"],
  ["ArrowLeft", "left"],
  ["KeyA", "left"]
]);

const state = {
  mode: "tutorial",
  running: false,
  score: 0,
  level: 1,
  hits: 0,
  combos: 0,
  misses: 0,
  streak: 0,
  timeLeft: TRAINING_SECONDS,
  aimed: null,
  activeController: null,
  lastTime: 0
};

const overlay = document.querySelector("#overlay");
const startTrainingButton = document.querySelector("#startTraining");
const tutorialButton = document.querySelector("#tutorialMode");
const modeLabel = document.querySelector("#modeLabel");
const timeLabel = document.querySelector("#timeLabel");
const levelLabel = document.querySelector("#levelLabel");
const scoreLabel = document.querySelector("#scoreLabel");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x06080d);
scene.fog = new THREE.Fog(0x06080d, 12, 40);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 80);
camera.position.set(0, 1.62, 0.2);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const controllerModelFactory = new XRControllerModelFactory();
const raycaster = new THREE.Raycaster();
const tempMatrix = new THREE.Matrix4();
const rayOrigin = new THREE.Vector3();
const rayDirection = new THREE.Vector3();
const intersectables = [];
const targets = [];
const controllers = [];
let mouseAiming = false;
let mouseNdc = new THREE.Vector2();

buildLighting();
buildRoom();
buildControllers();
buildTargets();
buildWorldPanels();
updateHud();

renderer.setAnimationLoop(render);

startTrainingButton.addEventListener("click", () => startTraining());
tutorialButton.addEventListener("click", () => startTutorial());
window.addEventListener("resize", onResize);
window.addEventListener("keydown", onKeyDown);
window.addEventListener("pointermove", onPointerMove);
window.addEventListener("pointerdown", () => {
  mouseAiming = true;
  updateMouseAim();
});

function buildLighting() {
  scene.add(new THREE.HemisphereLight(0xbadfff, 0x0b111a, 2.2));

  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(-3, 5, 2);
  scene.add(key);
}

function buildRoom() {
  const floor = new THREE.GridHelper(ROOM.depth, ROOM.depth, 0x4c7896, 0x1c2a36);
  floor.position.set(0, 0, -ROOM.depth / 2);
  scene.add(floor);

  const backGrid = new THREE.GridHelper(ROOM.width, 12, 0x456d86, 0x1a2a36);
  backGrid.rotation.x = Math.PI / 2;
  backGrid.position.set(0, ROOM.height / 2, -ROOM.depth);
  scene.add(backGrid);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.018, 12, 96),
    new THREE.MeshBasicMaterial({ color: 0x78e2ff })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.025;
  scene.add(ring);

  LANES.forEach((x) => {
    const lane = new THREE.Mesh(
      new THREE.BoxGeometry(0.78, 0.025, 30.5),
      new THREE.MeshBasicMaterial({ color: 0x143146, transparent: true, opacity: 0.58 })
    );
    lane.position.set(x, 0.015, -15.75);
    lane.userData.kind = "lane";
    lane.userData.laneX = x;
    scene.add(lane);
    intersectables.push(lane);

    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(0.82, 0.03, 30.5)),
      new THREE.LineBasicMaterial({ color: 0x70c7ff, transparent: true, opacity: 0.34 })
    );
    edge.position.copy(lane.position);
    scene.add(edge);
  });
}

function buildControllers() {
  for (let i = 0; i < 2; i += 1) {
    const controller = renderer.xr.getController(i);
    controller.userData.index = i;
    controller.userData.lastStickDirection = null;
    controller.userData.lastStickAt = 0;
    controller.addEventListener("connected", (event) => {
      controller.userData.gamepad = event.data.gamepad || null;
    });
    controller.addEventListener("disconnected", () => {
      controller.userData.gamepad = null;
      controller.userData.triggerPressed = false;
      controller.userData.laser.visible = false;
    });
    controller.addEventListener("selectstart", () => {
      state.activeController = controller;
      controller.userData.laser.visible = true;
    });
    scene.add(controller);

    const laser = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -30)]),
      new THREE.LineBasicMaterial({ color: 0x78e2ff, transparent: true, opacity: 0.82 })
    );
    laser.name = "laser";
    laser.visible = false;
    controller.userData.laser = laser;
    controller.add(laser);
    controllers.push(controller);

    const grip = renderer.xr.getControllerGrip(i);
    grip.add(controllerModelFactory.createControllerModel(grip));
    scene.add(grip);
  }
}

function buildTargets() {
  LANES.forEach((x, laneIndex) => {
    const group = new THREE.Group();
    group.position.set(x, 1.55, -8 - laneIndex * 5.5);
    group.userData.direction = randomDirection();
    group.userData.primed = false;
    group.userData.frontTime = 0;
    group.userData.laneIndex = laneIndex;

    const stand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 1.45, 12),
      new THREE.MeshStandardMaterial({ color: 0x0d0f13, roughness: 0.45 })
    );
    stand.position.y = -0.82;
    group.add(stand);
    group.userData.stand = stand;

    const board = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.34, 0.04, 64),
      new THREE.MeshStandardMaterial({ color: 0xf7fbff, roughness: 0.25 })
    );
    board.rotation.x = Math.PI / 2;
    group.add(board);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.36, 0.012, 12, 96),
      new THREE.MeshBasicMaterial({ color: 0x81dfff })
    );
    group.add(rim);
    group.userData.rim = rim;

    const landolt = new THREE.Mesh(
      new THREE.PlaneGeometry(LANDOLT_DIAMETER, LANDOLT_DIAMETER),
      new THREE.MeshBasicMaterial({ map: createLandoltTexture(group.userData.direction), transparent: true })
    );
    landolt.position.z = 0.035;
    group.add(landolt);
    group.userData.landolt = landolt;

    const valueLabel = makeTextSprite("0.00", { width: 256, height: 96, font: 40, color: "#f8fbff" });
    valueLabel.position.set(0, -0.52, 0.03);
    valueLabel.scale.set(0.64, 0.24, 1);
    group.add(valueLabel);
    group.userData.valueLabel = valueLabel;

    const reaction = makeTextSprite("", { width: 384, height: 128, font: 54, color: "#7bd5ff" });
    reaction.position.set(0, 0.62, 0.04);
    reaction.scale.set(0.9, 0.3, 1);
    reaction.visible = false;
    group.add(reaction);
    group.userData.reaction = reaction;

    group.userData.board = board;
    scene.add(group);
    targets.push(group);
    intersectables.push(board);
  });
}

function buildWorldPanels() {
  const title = makeTextSprite("Trigger: aim laser / Stick: gap direction", {
    width: 1024,
    height: 128,
    font: 44,
    color: "#dce7f3"
  });
  title.position.set(0, 2.95, -4.2);
  title.scale.set(4.2, 0.52, 1);
  scene.add(title);
}

function startTraining() {
  state.mode = "training";
  state.running = true;
  state.score = 0;
  state.level = 1;
  state.hits = 0;
  state.combos = 0;
  state.misses = 0;
  state.streak = 0;
  state.timeLeft = TRAINING_SECONDS;
  resetTargets();
  overlay.style.display = "none";
  updateHud();
}

function startTutorial() {
  state.mode = "tutorial";
  state.running = false;
  state.timeLeft = TRAINING_SECONDS;
  resetTargets();
  overlay.style.display = "none";
  updateHud();
}

function resetTargets() {
  targets.forEach((target, index) => {
    target.position.z = -7 - index * 6;
    target.userData.direction = randomDirection();
    target.userData.primed = false;
    target.userData.frontTime = 0;
    target.userData.stand.material.color.set(0x0d0f13);
    updateLandolt(target);
    setReaction(target, "");
  });
}

function render(timestamp) {
  const now = timestamp * 0.001;
  const delta = Math.min(0.05, now - (state.lastTime || now));
  state.lastTime = now;

  pollControllerInput(now);
  updateGame(delta);
  updateAiming();
  updateBillboards();
  renderer.render(scene, camera);
}

function updateGame(delta) {
  if (state.mode === "training" && state.running) {
    state.timeLeft -= delta;
    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      state.running = false;
      overlay.style.display = "grid";
      showResults();
    }
  }

  const speed = state.mode === "training" && state.running ? 0.22 + state.level * 0.035 : 0.045;
  targets.forEach((target) => {
    target.position.z = Math.min(LANE_Z_MIN, target.position.z + speed * delta);
    if (target.position.z >= LANE_Z_MIN - 0.01) {
      target.userData.frontTime += delta;
      if (state.mode === "training" && target.userData.frontTime > 1.2) {
        target.userData.frontTime = 0;
        state.level = Math.max(1, state.level - 1);
      }
    } else {
      target.userData.frontTime = 0;
    }

    updateAcuityLabel(target);
    target.userData.rim.material.color.set(target === state.aimed ? 0xffd447 : 0x81dfff);
  });

  updateHud();
}

function updateAiming() {
  let source = state.activeController || controllers.find((controller) => controller.userData.triggerPressed);
  if (renderer.xr.isPresenting && !source) {
    source = controllers[0];
  }

  if (renderer.xr.isPresenting && source) {
    tempMatrix.identity().extractRotation(source.matrixWorld);
    rayOrigin.setFromMatrixPosition(source.matrixWorld);
    rayDirection.set(0, 0, -1).applyMatrix4(tempMatrix);
    raycaster.set(rayOrigin, rayDirection);
  } else if (mouseAiming) {
    updateMouseAim();
  } else {
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  }

  const hits = raycaster.intersectObjects(intersectables, false);
  const aimed = hits.length ? findTargetFromObject(hits[0].object) : null;
  setAimed(aimed);
}

function updateMouseAim() {
  raycaster.setFromCamera(mouseNdc, camera);
}

function setAimed(target) {
  if (state.aimed === target) return;
  state.aimed = target;
}

function applyInput(direction) {
  const target = state.aimed || nearestFrontTarget();
  if (!target) return;

  if (direction === target.userData.direction) {
    const combo = target.userData.primed;
    if (combo) {
      state.combos += 1;
      state.streak += 1;
      pushTarget(target, 6.2 + state.level * 0.75);
      addScore(target, 150);
      setReaction(target, "Combo", "#ffe16a");
      target.userData.primed = false;
      target.userData.stand.material.color.set(0x0d0f13);
    } else {
      state.hits += 1;
      state.streak += 1;
      pushTarget(target, 3.7 + state.level * 0.45);
      addScore(target, 100);
      setReaction(target, "Hit", "#7bd5ff");
      targets.forEach((other) => {
        other.userData.primed = false;
        other.userData.stand.material.color.set(0x0d0f13);
      });
      target.userData.primed = true;
      target.userData.stand.material.color.set(0xffd447);
    }

    target.userData.direction = randomDirection(target.userData.direction);
    updateLandolt(target);
    if ((state.hits + state.combos) % 8 === 0) state.level = Math.min(20, state.level + 1);
  } else {
    state.misses += 1;
    state.streak = 0;
    setReaction(target, "Miss", "#ff7b7b");
  }

  updateHud();
}

function pollControllerInput(now) {
  if (!renderer.xr.isPresenting) return;

  controllers.forEach((controller) => {
    const gamepad = controller.gamepad || controller.userData.gamepad;
    if (!gamepad) return;

    const triggerPressed = Boolean(gamepad.buttons[0]?.pressed || gamepad.buttons[0]?.value > 0.55);
    controller.userData.triggerPressed = triggerPressed;
    controller.userData.laser.visible = triggerPressed;
    if (triggerPressed) state.activeController = controller;

    const direction = stickDirection(gamepad.axes);
    const canFire =
      triggerPressed &&
      direction &&
      (direction !== controller.userData.lastStickDirection || now - controller.userData.lastStickAt > 0.32);

    if (canFire) {
      applyInput(direction);
      controller.userData.lastStickDirection = direction;
      controller.userData.lastStickAt = now;
    }

    if (!direction) controller.userData.lastStickDirection = null;
  });
}

function stickDirection(axes) {
  if (!axes || axes.length < 2) return null;
  const x = axes.length >= 4 ? axes[2] : axes[0];
  const y = axes.length >= 4 ? axes[3] : axes[1];
  const absX = Math.abs(x);
  const absY = Math.abs(y);
  if (Math.max(absX, absY) < 0.55) return null;
  if (absX > absY) return x > 0 ? "right" : "left";
  return y > 0 ? "down" : "up";
}

function pushTarget(target, amount) {
  target.position.z = Math.max(LANE_Z_MAX, target.position.z - amount);
}

function addScore(target, base) {
  if (state.mode !== "training" || !state.running) return;
  const distance = Math.abs(target.position.z);
  const twoClosest = [...targets].sort((a, b) => Math.abs(a.position.z) - Math.abs(b.position.z)).slice(0, 2);
  const closeBonus = twoClosest.includes(target) ? 1 : 0.25;
  state.score += Math.round((base + state.level * 12 + distance * 4) * closeBonus);
}

function nearestFrontTarget() {
  return [...targets].sort((a, b) => Math.abs(a.position.z) - Math.abs(b.position.z))[0];
}

function findTargetFromObject(object) {
  if (object.userData.kind === "lane") {
    return targets.find((target) => target.position.x === object.userData.laneX) || null;
  }

  return targets.find((target) => target.userData.board === object) || null;
}

function setReaction(target, text, color = "#7bd5ff") {
  const sprite = target.userData.reaction;
  if (!text) {
    sprite.visible = false;
    return;
  }
  updateTextSprite(sprite, text, { width: 384, height: 128, font: 56, color });
  sprite.visible = true;
  window.setTimeout(() => {
    if (sprite.material.map.userData.text === text) sprite.visible = false;
  }, 620);
}

function showResults() {
  overlay.querySelector("h1").textContent = "Training Result";
  overlay.querySelector(".panel > p:not(.kicker):not(.notice)").textContent =
    `Score ${state.score} / Lv ${state.level} / Hit ${state.hits} / Combo ${state.combos} / Miss ${state.misses}`;
  startTrainingButton.textContent = "Retry";
  tutorialButton.textContent = "Tutorial";
}

function onKeyDown(event) {
  const direction = KEY_TO_DIR.get(event.code);
  if (direction) applyInput(direction);
  if (event.code === "Space") startTraining();
}

function onPointerMove(event) {
  mouseNdc.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouseNdc.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function updateHud() {
  modeLabel.textContent = state.mode === "training" ? "Training" : "Tutorial";
  timeLabel.textContent = state.mode === "training" ? formatTime(state.timeLeft) : "--";
  levelLabel.textContent = `Lv ${state.level}`;
  scoreLabel.textContent = `Score ${state.score}`;
}

function updateAcuityLabel(target) {
  const decimal = decimalAcuity(Math.abs(target.position.z));
  updateTextSprite(target.userData.valueLabel, decimal.toFixed(2), {
    width: 256,
    height: 96,
    font: 40,
    color: "#f8fbff"
  });
}

function updateBillboards() {
  targets.forEach((target) => target.quaternion.copy(camera.quaternion));
}

function updateLandolt(target) {
  target.userData.landolt.material.map.dispose();
  target.userData.landolt.material.map = createLandoltTexture(target.userData.direction);
  target.userData.landolt.material.needsUpdate = true;
}

function createLandoltTexture(direction) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.translate(128, 128);
  ctx.rotate(directionToAngle(direction));
  ctx.strokeStyle = "#0a0d12";
  ctx.lineWidth = 42;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.arc(0, 0, 72, 0.62, Math.PI * 2 - 0.62, false);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 8;
  return texture;
}

function makeTextSprite(text, options) {
  const texture = makeTextTexture(text, options);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.material.map.userData.text = text;
  return sprite;
}

function updateTextSprite(sprite, text, options) {
  if (sprite.material.map.userData.text === text) return;
  sprite.material.map.dispose();
  sprite.material.map = makeTextTexture(text, options);
  sprite.material.map.userData.text = text;
  sprite.material.needsUpdate = true;
}

function makeTextTexture(text, { width, height, font, color }) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "rgba(5, 9, 14, 0.68)";
  roundRect(ctx, 8, 8, width - 16, height - 16, 12);
  ctx.fill();
  ctx.font = `800 ${font}px Inter, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text, width / 2, height / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function decimalAcuity(distanceMeters) {
  const onePointZeroDistance = LANDOLT_DIAMETER / (5 * (Math.PI / 180 / 60));
  return Math.max(0.01, distanceMeters / onePointZeroDistance);
}

function randomDirection(except = null) {
  let direction = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
  while (direction === except) direction = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
  return direction;
}

function directionToAngle(direction) {
  if (direction === "right") return 0;
  if (direction === "down") return Math.PI / 2;
  if (direction === "left") return Math.PI;
  return -Math.PI / 2;
}

function formatTime(seconds) {
  const value = Math.ceil(seconds);
  const minutes = Math.floor(value / 60);
  const rest = `${value % 60}`.padStart(2, "0");
  return `${minutes}:${rest}`;
}
