// Dev bench for the battle models: /dev/units?unit=tank. One row of the unit in every nation's
// colours on a plain floor, with its moving parts driven from the console through window.__u:
//   __u.aim(x, y, z) / __u.aim(null)   train the guns on a point (or rest them)
//   __u.fire()                          kick the guns
//   __u.speed = 4                       drive forward at that many metres a second (wheels, tracks)
//   __u.fly = true                      propellers at speed
//   __u.wreck = 1                       burnt out
//   __u.soldier('aim' | 'ready' | 'run' | 'dead')
//   __u.cam(azimuth, elevation, distance)
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { loadUnit } from '../axis/battle/stage/assets';
import { discTexture, markColumn, markRow, markSheet, MARK_COLS, MARK_NATIONS, MARK_ROWS } from '../axis/battle/stage/insignia';
import { RigBatch, decalMaterial, newRigState, nodeWorld, poseRig, unitMaterial, type RigState } from '../axis/battle/stage/rig';
import { Soldier, helmetFor } from '../axis/battle/stage/soldier';
import { combatantPaint } from '../axis/battle/model';

interface Bench {
  aim: (x: number | null, y?: number, z?: number) => void;
  fire: () => void;
  speed: number;
  fly: boolean;
  wreck: number;
  paused: boolean;
  soldier: (mode: string) => void;
  cam: (az: number, el: number, dist?: number, lookY?: number) => void;
  step: (seconds: number) => void;
  info: () => unknown;
}

export function UnitsDev() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current!;
    const q = new URLSearchParams(window.location.search);
    const key = q.get('unit') ?? 'tank';
    const nations = (q.get('nations') ?? MARK_NATIONS.join(',')).split(',');
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8a94a0);
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 2000);
    scene.add(new THREE.HemisphereLight(0xdfe8f2, 0x4a4438, 0.6));
    const sun = new THREE.DirectionalLight(0xfff2dd, 3.2);
    sun.position.set(-60, 90, 70);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    scene.add(sun);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshStandardMaterial({ color: 0x55584f, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const sky = new THREE.Scene();
    sky.background = new THREE.Color(0x9fb4c8);
    scene.environment = pmrem.fromScene(sky).texture;
    scene.environmentIntensity = 0.5;

    let disposed = false;
    let raf = 0;
    const figures: { m: THREE.Matrix4; rs: RigState; soldier: Soldier | null; x: number; z0: number }[] = [];
    const bench: Bench = {
      aim: () => {}, fire: () => {}, speed: 0, fly: key === 'fighter' || key === 'bomber', wreck: 0, paused: false,
      soldier: () => {}, cam: () => {}, step: () => {}, info: () => null,
    };
    (window as unknown as { __u: Bench }).__u = bench;

    void loadUnit(key).then((asset) => {
      if (disposed) return;
      const rig = asset.rig;
      const marks = markSheet();
      const batch = new RigBatch(rig, nations.length, scene, {
        body: unitMaterial(asset.textures, false), track: unitMaterial(asset.textures, true),
        decal: decalMaterial(marks, MARK_COLS, MARK_ROWS),
        propdisc: new THREE.MeshBasicMaterial({ map: discTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.85 }),
      }, true);
      const gap = Math.max(rig.size.x * 1.5, 2.2);
      const air = key === 'fighter' || key === 'bomber';
      nations.forEach((power, i) => {
        const rs = newRigState(rig, helmetFor(power));
        const x = (i - (nations.length - 1) / 2) * gap;
        figures.push({ m: new THREE.Matrix4(), rs, soldier: key === 'infantry' && !rig.standIn ? new Soldier(rig, rs) : null, x, z0: 0 });
        batch.setTint(i, new THREE.Color(combatantPaint(power)));
        batch.setCells(i, markColumn(power), markRow);
      });
      const reach = Math.max(rig.size.z, gap * nations.length * 0.5, rig.size.y);
      sun.shadow.camera.left = -reach * 1.4; sun.shadow.camera.right = reach * 1.4;
      sun.shadow.camera.top = reach * 1.4; sun.shadow.camera.bottom = -reach * 1.4;
      sun.shadow.camera.far = 400;
      sun.shadow.camera.updateProjectionMatrix();
      const look = new THREE.Vector3(0, rig.size.y * 0.45 + (air ? 6 : 0), 0);
      bench.cam = (az, elv, dist = reach * 2.6, lookY) => {
        if (lookY != null) look.y = lookY;
        const a = (az * Math.PI) / 180, e = (elv * Math.PI) / 180;
        camera.position.set(look.x + Math.sin(a) * Math.cos(e) * dist, look.y + Math.sin(e) * dist, look.z + Math.cos(a) * Math.cos(e) * dist);
        camera.lookAt(look);
      };
      bench.cam(Number(q.get('az') ?? 35), Number(q.get('el') ?? 18), q.get('dist') ? Number(q.get('dist')) : undefined);
      bench.aim = (x, y = 0, z = 0) => {
        for (const f of figures) {
          const p = x == null ? null : new THREE.Vector3(f.x + x, y, z);
          f.rs.aim = p; f.rs.aimAir = p;
          f.soldier?.aim(p);
        }
      };
      bench.fire = () => { for (const f of figures) { f.rs.kick.fill(1); f.soldier?.shoot(); } };
      let mode = 'ready';
      bench.soldier = (m) => { mode = m; for (const f of figures) f.soldier?.aim(m === 'aim' ? new THREE.Vector3(f.x, 1, 50) : null); };
      let t = 0, death = 0;
      const tick = (dt: number) => {
        t += dt;
        death = mode === 'dead' ? Math.min(1, death + dt / 0.9) : 0;
        figures.forEach((f, i) => {
          f.z0 += bench.speed * dt;
          if (f.z0 > reach * 1.5) f.z0 = -reach * 1.5;
          const before = f.z0 - bench.speed * dt;
          f.rs.travel += (f.z0 - before) / rig.scale;
          f.rs.flying = bench.fly;
          f.rs.wreck = bench.wreck;
          f.m.makeTranslation(f.x, air ? 6 : 0, f.z0);
          f.soldier?.update(dt, t, { moving: mode === 'run' ? 1 : 0, death, dying: mode === 'dead', seed: i * 7 });
          poseRig(rig, f.rs, f.m, dt, batch, i);
          const link = rig.nodes.find((n) => n.anim === 'track')?.link ?? 0.15;
          batch.setFx(i, bench.wreck * 0.9, ((f.rs.travel / link) % 1 + 1) % 1);
        });
        batch.commit();
      };
      bench.step = (seconds) => { for (let s = 0; s < seconds; s += 1 / 60) tick(1 / 60); renderer.render(scene, camera); };
      bench.info = () => ({
        key, standIn: rig.standIn, triangles: rig.triangles, size: rig.size.toArray().map((v) => +v.toFixed(2)), scale: +rig.scale.toFixed(3),
        meshes: rig.meshes.map((m) => `${m.kind} x${m.perFigure} ${m.triangles}`),
        nodes: rig.nodes.map((n) => `${n.name}[${n.marker ?? n.anim}${n.kind ? ':' + n.kind : ''}]`),
        muzzle0: rig.muzzles.length ? nodeWorld(rig, figures[0].rs, figures[0].m, rig.muzzles[0], new THREE.Vector3()).toArray().map((v) => +v.toFixed(2)) : null,
      });
      const clock = new THREE.Clock();
      const loop = () => {
        if (disposed) return;
        raf = requestAnimationFrame(loop);
        const dt = Math.min(0.1, clock.getDelta());
        if (!bench.paused) tick(dt);
        renderer.render(scene, camera);
      };
      loop();
    });

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={host} style={{ position: 'fixed', inset: 0, background: '#000' }} />;
}
