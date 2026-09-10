import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/* Beveled edges are what separate "premium low-poly" from "programmer boxes":
   every hard edge catches a highlight instead of dying into a flat seam. */
const geoCache = new Map();
/* RoundedBoxGeometry costs ~588 triangles per box whatever the segment count —
   a plain box is 12. That bevel is worth paying for on a crate you stand next
   to, and completely invisible on a 10 cm skirting strip or a light bar. So any
   box with a thin dimension silently drops to a plain box: same silhouette on
   screen, a fiftieth of the triangles. */
const FLAT_BELOW = 0.36;
export function rbox(w, h, d, r = 0.06, seg = 1){
  /* RoundedBoxGeometry costs far more than a plain box, and that bevel is worth
     paying for on a crate you stand beside but invisible on a 10 cm light strip.
     Thin boxes therefore use a plain BoxGeometry — NOT RoundedBoxGeometry with
     zero segments, which silently ignores w/h/d and hands back a 1x1x1 cube. */
  const thin = Math.min(w, h, d) < FLAT_BELOW;
  const k = thin ? `flat|${w}|${h}|${d}` : `${w}|${h}|${d}|${r}|${seg}`;
  if (!geoCache.has(k))
    geoCache.set(k, thin
      ? new THREE.BoxGeometry(w, h, d)
      : new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2)));
  return geoCache.get(k);
}

const cylCache = new Map();
export function cyl(rt, rb, h, seg = 12){
  // 12 segments still reads round at this camera height; 20 was costing ~40%
  // more triangles on every tank, barrel and machine in the game.
  const k = `${rt}|${rb}|${h}|${seg}`;
  if (!cylCache.has(k)) cylCache.set(k, new THREE.CylinderGeometry(rt, rb, h, seg, 1));
  return cylCache.get(k);
}

export const PAL = {
  floor:   0x3f7f88,
  floorLn: 0x2f646d,
  wall:    0xb9cdd6,
  wallTop: 0xd2e0e4,
  prop:    0xd4e0e5,   // was near-white: bright enough to bloom under the key light
  propDk:  0xb4c6cc,
  orange:  0xff8c42,
  gold:    0xf5c518,
  red:     0xe03535,
  green:   0x22c55e,
  dark:    0x12161c,
  suit:    0x2b3440,
  mag:     0xd946ef,
};

const cache = new Map();
export function mat(color, rough = 0.72, metal = 0.0, extra = {}){
  const k = `${color}|${rough}|${metal}|${JSON.stringify(extra)}`;
  if (!cache.has(k)) cache.set(k, new THREE.MeshStandardMaterial({
    color, roughness: rough, metalness: metal, ...extra
  }));
  return cache.get(k);
}
export function emissive(color, strength = 1.6){
  return mat(color, 0.5, 0, { emissive: color, emissiveIntensity: strength });
}

/* ---------- procedural floor ---------- */
let _floorTex = null;
/** One shared texture; only `repeat` differs per room, and one room exists at a time. */
export function sharedFloorTexture(){
  if (!_floorTex) _floorTex = floorTexture();
  return _floorTex;
}

export function floorTexture(px = 1024, tiles = 8){
  const c = document.createElement('canvas'); c.width = c.height = px;
  const g = c.getContext('2d');
  const hx = (n) => '#' + n.toString(16).padStart(6, '0');

  g.fillStyle = hx(PAL.floor); g.fillRect(0, 0, px, px);

  // large panel joints
  const step = px / tiles;
  g.strokeStyle = hx(PAL.floorLn); g.lineWidth = Math.max(2, px / 420);
  for (let i = 0; i <= tiles; i++){
    g.beginPath(); g.moveTo(i*step, 0); g.lineTo(i*step, px); g.stroke();
    g.beginPath(); g.moveTo(0, i*step); g.lineTo(px, i*step); g.stroke();
  }
  // a lighter inner scribe line so the joint reads as a real seam, not a drawn line
  g.strokeStyle = 'rgba(255,255,255,.055)'; g.lineWidth = Math.max(1, px / 900);
  for (let i = 0; i <= tiles; i++){
    g.beginPath(); g.moveTo(i*step + 2, 0); g.lineTo(i*step + 2, px); g.stroke();
    g.beginPath(); g.moveTo(0, i*step + 2); g.lineTo(px, i*step + 2); g.stroke();
  }
  // scuffs + grime so the surface isn't dead flat under the key light
  for (let i = 0; i < 850; i++){
    const x = Math.random()*px, y = Math.random()*px, r = Math.random()*26 + 3;
    g.fillStyle = `rgba(${Math.random() < .5 ? '255,255,255' : '0,0,0'},${Math.random()*0.030})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI*2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* soft radial blob used as a contact shadow under entities */
export function blobTexture(px = 256){
  const c = document.createElement('canvas'); c.width = c.height = px;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(px/2, px/2, 0, px/2, px/2, px/2);
  grd.addColorStop(0,   'rgba(0,0,0,.55)');
  grd.addColorStop(0.45,'rgba(0,0,0,.30)');
  grd.addColorStop(1,   'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, px, px);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
