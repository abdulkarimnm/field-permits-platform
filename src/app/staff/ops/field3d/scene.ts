/* ─────────────────────────────────────────────────────────────
   Real 3D diorama of the field (three.js, client only).
   - The aerial photo is draped over a relief mesh: the mountain wall at the top,
     the town on its slope, and the Archers' hill stand up out of the ground.
   - Every zone is a translucent volume that rises with its load and glows in its
     status colour; gates are posts with a ring that pulses while checks come in.
   - The camera orbits (drag / pinch), zooms, and drifts slowly when idle.
   - Labels are HTML (CSS2D), so Arabic stays crisp and every pin is a real button.
   Positions are in the photo's own pixels (1029 × 600): replace the photo → edit POS.
   ───────────────────────────────────────────────────────────── */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";

export const W = 1029, H = 600;
const SIZE = 10, DEPTH = (SIZE * H) / W;
const toWorld = (px: number, py: number): [number, number] => [(px / W - 0.5) * SIZE, (py / H - 0.5) * DEPTH];

/* zone footprints as ellipses on the photo: centre, radii (px), rotation (rad) */
export const ZONE_SHAPE: Record<string, { c: [number, number]; r: [number, number]; rot: number }> = {
  A: { c: [540, 445], r: [115, 62], rot: -0.12 }, // الساحة الرئيسية
  B: { c: [640, 316], r: [92, 40], rot: 0.08 }, //  مواقف الزوار
  C: { c: [735, 480], r: [62, 42], rot: 0.15 }, //  منطقة الخدمات
  D: { c: [668, 395], r: [70, 44], rot: 0.35 }, //  محيط جبل الرماة
  E: { c: [398, 368], r: [72, 44], rot: 0.1 }, //   المسار التاريخي
};
export const GATE_XY: Record<number, [number, number]> = { 1: [505, 268], 2: [545, 560], 3: [868, 492] };

/* ── terrain ─────────────────────────────────────────────── */
const hash = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 4; i++) { s += a * vnoise(x * f, y * f); a *= 0.5; f *= 2.1; } return s; }
const smooth = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const bump = (u: number, v: number, cx: number, cy: number, rx: number, ry: number) => Math.exp(-(((u - cx) / rx) ** 2 + ((v - cy) / ry) ** 2));

/** Height (world units) at photo-normalised (u, v), v = 0 at the top edge. */
export function terrainHeight(u: number, v: number) {
  // mountain wall across the top; it starts higher up on the right where the palm grove is
  const start = 0.44 - 0.18 * smooth(0.5, 0.72, u);
  const m = smooth(start, 0.02, v);
  let h = m * m * (0.75 + 0.5 * fbm(u * 5 + 3, v * 5)) * 1.7;
  // the town climbs the slope on the left
  h += smooth(0.5, 0.1, v) * (0.14 - 0.1 * smooth(0.55, 0.7, u));
  // Archers' hill and the small heritage mound
  h += 0.3 * bump(u, v, 0.65, 0.66, 0.08, 0.055);
  h += 0.05 * bump(u, v, 0.387, 0.613, 0.07, 0.045);
  return h;
}
const heightAt = (px: number, py: number) => terrainHeight(px / W, py / H);

/* ── public API ──────────────────────────────────────────── */
export type SceneZone = { id: number; code: string; name: string; value: string; color: string; ratio: number; idle: boolean; crit: boolean; sensitive: boolean };
export type SceneGate = { id: number; name: string; n: number; alarm: boolean };
export type SceneData = { zones: SceneZone[]; gates: SceneGate[]; sel: { kind: "zone" | "gate"; id: number } | null };
export type FieldScene = { update(d: SceneData): void; dispose(): void };

export function createFieldScene(host: HTMLElement, opts: { src: string; onSelect: (s: { kind: "zone" | "gate"; id: number }) => void; reducedMotion: boolean }): FieldScene {
  const small = Math.max(host.clientWidth, 320) < 700;
  const coarse = matchMedia("(pointer: coarse)").matches;
  let disposed = false;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.5 : 2));
  renderer.shadowMap.enabled = !small;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.className = "f3d-gl";
  host.appendChild(renderer.domElement);

  const labels = new CSS2DRenderer();
  labels.domElement.className = "f3d-labels";
  host.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x1e0c09, 11, 22);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 60);
  camera.position.set(1.2, 5.6, 6.8);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.25, 0.5);
  controls.enableDamping = true; controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
  renderer.domElement.style.touchAction = "pan-y"; // the controls set "none"; vertical drags must still scroll the page
  controls.minDistance = 4; controls.maxDistance = 14;
  controls.minPolarAngle = 0.35; controls.maxPolarAngle = 1.32;
  controls.autoRotateSpeed = 0.45;
  controls.autoRotate = !opts.reducedMotion;
  let idleTimer = 0;
  controls.addEventListener("start", () => { controls.autoRotate = false; clearTimeout(idleTimer); });
  controls.addEventListener("end", () => { if (!opts.reducedMotion) idleTimer = window.setTimeout(() => (controls.autoRotate = true), 7000); });

  /* light: a low warm sun from the north-west (the photo was taken near sunset) */
  scene.add(new THREE.HemisphereLight(0xffe6cc, 0x2a1410, 0.85));
  const sun = new THREE.DirectionalLight(0xffcf9a, 1.6);
  sun.position.set(-5, 7, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(small ? 512 : 1024, small ? 512 : 1024);
  sun.shadow.camera.left = -7; sun.shadow.camera.right = 7; sun.shadow.camera.top = 7; sun.shadow.camera.bottom = -7;
  sun.shadow.bias = -0.0008;
  scene.add(sun);

  /* ground: displaced plane with the photo on it, sitting on a dark slab */
  const geo = new THREE.PlaneGeometry(SIZE, DEPTH, 176, 103);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, terrainHeight(x / SIZE + 0.5, z / DEPTH + 0.5));
  }
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x6b4a3a, roughness: 0.95, metalness: 0 }));
  ground.receiveShadow = true;
  scene.add(ground);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(SIZE + 0.3, 0.3, DEPTH + 0.3), new THREE.MeshStandardMaterial({ color: 0x24100c, roughness: 0.8 }));
  slab.position.y = -0.19; // top at -0.04: always under the ground
  scene.add(slab);
  const rim = new THREE.Mesh(new THREE.BoxGeometry(SIZE + 0.34, 0.02, DEPTH + 0.34), new THREE.MeshStandardMaterial({ color: 0xc9a66b, roughness: 0.4, metalness: 0.5, emissive: 0x5a4020, emissiveIntensity: 0.4 }));
  rim.position.y = -0.03; // a gold hairline round the slab edge, never above the ground
  scene.add(rim);

  new THREE.TextureLoader().load(opts.src, (tex) => {
    if (disposed) { tex.dispose(); return; }
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const m = ground.material as THREE.MeshStandardMaterial;
    m.map = tex; m.color.set(0xffffff); m.needsUpdate = true;
  }, undefined, () => { /* photo missing: the relief still shows in its base colour */ });

  /* zones */
  type ZoneObj = { mesh: THREE.Mesh; edge: THREE.LineSegments; label: CSS2DObject; el: HTMLButtonElement; name: HTMLSpanElement; val: HTMLSpanElement; targetH: number; base: number; color: THREE.Color; id: number; code: string };
  const zoneObjs = new Map<number, ZoneObj>();
  const pick: THREE.Object3D[] = [];
  const makeLabel = (kind: "zone" | "gate", id: number) => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = `f3d-pin f3d-pin-${kind}`;
    const name = document.createElement("span"); name.className = "f3d-pin-name";
    const val = document.createElement("span"); val.className = "f3d-pin-val num";
    el.append(name, val);
    el.addEventListener("click", (e) => { e.stopPropagation(); opts.onSelect({ kind, id }); });
    return { el, name, val };
  };
  const ensureZone = (z: SceneZone) => {
    let o = zoneObjs.get(z.id);
    if (o) return o;
    const s = ZONE_SHAPE[z.code];
    if (!s) return null;
    const [rx, ry] = [(s.r[0] / W) * SIZE, (s.r[1] / H) * DEPTH];
    const shape = new THREE.Shape();
    shape.absellipse(0, 0, rx, ry, 0, Math.PI * 2, false, 0);
    const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 48 });
    g.rotateX(-Math.PI / 2); // extrude along +y
    const color = new THREE.Color(z.color);
    const mat = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.5, roughness: 0.25, metalness: 0, emissive: color, emissiveIntensity: 0.25, depthWrite: false });
    const mesh = new THREE.Mesh(g, mat);
    mesh.renderOrder = 10 + zoneObjs.size; // stable order between overlapping translucent volumes
    const [x, zz] = toWorld(s.c[0], s.c[1]);
    let base = Infinity;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) base = Math.min(base, heightAt(s.c[0] + Math.cos(a) * s.r[0], s.c[1] + Math.sin(a) * s.r[1]));
    base = Math.min(base, heightAt(s.c[0], s.c[1])) - 0.02;
    mesh.position.set(x, base, zz);
    mesh.rotation.y = -s.rot;
    mesh.scale.y = 0.001;
    mesh.userData = { kind: "zone", id: z.id };
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(g, 40), new THREE.LineBasicMaterial({ color: 0xe9cfa6, transparent: true, opacity: z.sensitive ? 0.9 : 0.35 }));
    mesh.add(edge);
    scene.add(mesh); pick.push(mesh);
    const { el, name, val } = makeLabel("zone", z.id);
    const label = new CSS2DObject(el);
    scene.add(label);
    o = { mesh, edge, label, el, name, val, targetH: 0.1, base, color, id: z.id, code: z.code };
    zoneObjs.set(z.id, o);
    return o;
  };

  /* gates */
  type GateObj = { group: THREE.Group; ring: THREE.Mesh; ping: THREE.Mesh; label: CSS2DObject; el: HTMLButtonElement; name: HTMLSpanElement; val: HTMLSpanElement; on: boolean; alarm: boolean };
  const gateObjs = new Map<number, GateObj>();
  const ensureGate = (g: SceneGate) => {
    let o = gateObjs.get(g.id);
    if (o) return o;
    const p = GATE_XY[g.id];
    if (!p) return null;
    const [x, zz] = toWorld(p[0], p[1]);
    const y = heightAt(p[0], p[1]);
    const group = new THREE.Group();
    group.position.set(x, y, zz);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.6, 12), new THREE.MeshStandardMaterial({ color: 0xe9cfa6, roughness: 0.4, metalness: 0.6 }));
    post.position.y = 0.3; post.castShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 10, 40), new THREE.MeshStandardMaterial({ color: 0xc9a66b, emissive: 0xc9a66b, emissiveIntensity: 0.6, roughness: 0.3 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.62;
    const ping = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 40), new THREE.MeshBasicMaterial({ color: 0x3aa0c8, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    ping.rotation.x = -Math.PI / 2; ping.position.y = 0.03;
    group.add(post, ring, ping);
    group.userData = { kind: "gate", id: g.id };
    post.userData = group.userData; ring.userData = group.userData;
    scene.add(group); pick.push(post, ring);
    const { el, name, val } = makeLabel("gate", g.id);
    const label = new CSS2DObject(el);
    label.position.set(x, y + 0.95, zz);
    scene.add(label);
    o = { group, ring, ping, label, el, name, val, on: false, alarm: false };
    gateObjs.set(g.id, o);
    return o;
  };

  /* click on a volume or a gate (not a drag) */
  const ray = new THREE.Raycaster();
  let down: [number, number] | null = null;
  const onDown = (e: PointerEvent) => { down = e.isPrimary ? [e.clientX, e.clientY] : null; };
  const onCancel = () => { down = null; };
  const onUp = (e: PointerEvent) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down[0], e.clientY - down[1]);
    down = null;
    if (moved > 6) return;
    const b = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1), camera);
    const hit = ray.intersectObjects([...pick, ground], false)[0]; // the ground can hide what is behind the mountain
    const u = hit?.object.userData as { kind?: "zone" | "gate"; id?: number } | undefined;
    if (u?.kind && u.id != null) opts.onSelect({ kind: u.kind, id: u.id });
  };
  renderer.domElement.addEventListener("pointerdown", onDown);
  renderer.domElement.addEventListener("pointerup", onUp);
  renderer.domElement.addEventListener("pointercancel", onCancel);

  /* size + loop (paused when hidden or off-screen) */
  const resize = () => {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.setSize(w, h, false); labels.setSize(w, h);
  };
  resize();
  const ro = new ResizeObserver(resize); ro.observe(host);
  let visible = true, raf = 0;
  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; }); io.observe(host);
  const clock = new THREE.Clock();
  let sel: SceneData["sel"] = null;
  let lastFrame = 0;
  const tick = (now = 0) => {
    raf = requestAnimationFrame(tick);
    if (!visible || document.hidden) return;
    if (coarse && now - lastFrame < 1000 / 30) return; // 30 fps is plenty on a phone, and kinder to the battery
    lastFrame = now;
    const dt = Math.min(0.05, clock.getDelta()), tm = clock.elapsedTime;
    controls.update();
    for (const o of zoneObjs.values()) {
      o.mesh.scale.y += (o.targetH - o.mesh.scale.y) * Math.min(1, dt * 4);
      const on = sel?.kind === "zone" && sel.id === o.id;
      const mat = o.mesh.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity += (((on ? 0.7 : 0.25) + (o.mesh.userData.crit ? 0.15 * Math.sin(tm * 4) : 0)) - mat.emissiveIntensity) * Math.min(1, dt * 6);
      o.label.position.set(o.mesh.position.x, o.base + o.mesh.scale.y + 0.22, o.mesh.position.z);
    }
    for (const o of gateObjs.values()) {
      if (o.on) {
        const ph = (tm % 1.8) / 1.8;
        o.ping.scale.setScalar(1 + ph * 2.2);
        (o.ping.material as THREE.MeshBasicMaterial).opacity = (1 - ph) * 0.8;
      } else (o.ping.material as THREE.MeshBasicMaterial).opacity = 0;
    }
    renderer.render(scene, camera);
    labels.render(scene, camera);
  };
  tick();

  return {
    update(d) {
      sel = d.sel;
      for (const z of d.zones) {
        const o = ensureZone(z);
        if (!o) continue;
        o.targetH = z.idle ? 0.06 : 0.12 + Math.min(1, z.ratio) * 1.1;
        const mat = o.mesh.material as THREE.MeshStandardMaterial;
        mat.color.set(z.color); mat.emissive.set(z.color); mat.opacity = z.idle ? 0.22 : 0.5;
        o.mesh.userData.crit = z.crit;
        const on = d.sel?.kind === "zone" && d.sel.id === z.id;
        (o.edge.material as THREE.LineBasicMaterial).color.set(on ? 0xfff6e6 : 0xe9cfa6);
        o.name.textContent = z.name + (z.sensitive ? " ◆" : "");
        o.val.textContent = z.value; o.val.style.color = on ? "" : z.color;
        o.el.style.setProperty("--pin", z.color);
        o.el.classList.toggle("is-on", on);
        o.el.setAttribute("aria-pressed", String(on));
        o.el.setAttribute("aria-label", `${z.name} — ${z.value}`);
      }
      for (const g of d.gates) {
        const o = ensureGate(g);
        if (!o) continue;
        o.on = g.n > 0; o.alarm = g.alarm;
        (o.ping.material as THREE.MeshBasicMaterial).color.set(g.alarm ? 0xe0524a : 0x3aa0c8);
        (o.ring.material as THREE.MeshStandardMaterial).emissive.set(g.alarm ? 0xe0524a : 0xc9a66b);
        const on = d.sel?.kind === "gate" && d.sel.id === g.id;
        o.name.textContent = g.name; o.val.textContent = String(g.n);
        o.el.classList.toggle("is-on", on); o.el.classList.toggle("is-alarm", g.alarm);
        o.el.setAttribute("aria-pressed", String(on));
        o.el.setAttribute("aria-label", `${g.name}: ${g.n}`);
      }
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); clearTimeout(idleTimer);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointercancel", onCancel);
      controls.dispose();
      sun.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        for (const mt of mats) { (mt as THREE.MeshStandardMaterial).map?.dispose(); mt.dispose(); }
      });
      renderer.forceContextLoss(); // browsers cap live GL contexts; free this one now, not at GC time
      renderer.dispose();
      renderer.domElement.remove(); labels.domElement.remove();
    },
  };
}
