import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }     from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass }     from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass }     from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GTAOPass }       from 'three/addons/postprocessing/GTAOPass.js';

/* Final grade: vignette, gentle S-curve, a whisper of grain.
   Runs in linear HDR, before OutputPass does tonemap + sRGB. */
const GradeShader = {
  uniforms: {
    tDiffuse:{value:null}, uTime:{value:0},
    uVignette:{value:1.12}, uGrain:{value:0.026}, uContrast:{value:1.10}, uSat:{value:1.22}
  },
  vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader:`
    uniform sampler2D tDiffuse; uniform float uTime,uVignette,uGrain,uContrast,uSat;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      // vignette
      vec2 d = vUv - 0.5;
      float v = 1.0 - dot(d,d) * uVignette;
      c.rgb *= clamp(v,0.0,1.0);
      // saturation + contrast around mid grey
      float l = dot(c.rgb, vec3(0.2126,0.7152,0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSat);
      c.rgb = (c.rgb - 0.18) * uContrast + 0.18;
      // grain
      c.rgb += (hash(vUv*vec2(1920.,1080.) + uTime*37.0) - 0.5) * uGrain;
      gl_FragColor = vec4(max(c.rgb,0.0), c.a);
    }`
};

export class Engine {
  constructor(canvas){
    this.canvas = canvas;
    this.postEnabled = true;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias:false, powerPreference:'high-performance' });
    this.maxDpr = 1.5;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.maxDpr));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070a);

    // Without something to reflect, metalness reads as flat black and every
    // surface loses its specular. A generated room probe is cheap and fixes both.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    if ('environmentIntensity' in this.scene) this.scene.environmentIntensity = 0.28;
    pmrem.dispose();
    this.scene.fog = new THREE.Fog(0x05070a, 44, 96);

    this.camera = new THREE.PerspectiveCamera(36, 1, 1, 220);
    // ~50° pitch: shallow enough to see the inner face of the far wall
    this.camOffset = new THREE.Vector3(0, 20.5, 17.5);
    this.zoom = 1;
    this.roomZoom = 1;
    this.clampX = 0;
    this.clampZ = 0;
    this._off = new THREE.Vector3();
    this.camTarget = new THREE.Vector3();
    this.shake = 0;
    this.camLook   = new THREE.Vector3();

    // multisampled HDR buffer so we keep real AA through post
    const rt = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType, samples: 2,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter
    });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    // Contact darkening where surfaces meet. This is the single biggest
    // difference between "lit scene" and "rendered scene".
    try {
      this.gtao = new GTAOPass(this.scene, this.camera, 1, 1);
      this.gtao.output = GTAOPass.OUTPUT.Default;
      this.gtao.blendIntensity = 1.0;
      // radius is in WORLD units — at this scene's scale anything under ~1 m
      // computes an almost-white AO buffer and costs GPU for nothing
      this.gtao.updateGtaoMaterial?.({
        radius: 2.0, distanceExponent: 1.0, thickness: 1.0,
        scale: 1.0, samples: 8, screenSpaceRadius: false
      });
      this.gtao.enabled = false;      // opt-in: see setQuality(3)
      this.composer.addPass(this.gtao);
    } catch (e) { console.warn('GTAO unavailable, continuing without AO:', e.message); }

    this.bloom = new UnrealBloomPass(new THREE.Vector2(1,1), 0.32, 0.7, 1.35);
    this.composer.addPass(this.bloom);

    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());

    this.quality = 2;
    this.autoQuality = false; // Preserve visual quality; never silently remove effects.
    this._acc = 0; this._n = 0; this._grace = 3;

    this.clock = new THREE.Clock();
    this._onResize = this.resize.bind(this);
    addEventListener('resize', this._onResize);
    this.resize();
  }

  /* Quality ladder. GTAO costs a whole extra scene render (normals + depth) plus
     an AO pass and a denoise, so it is the first thing to go. */
  static LEVELS = [
    { dpr: 0.8, ao: false, bloom: false, shadow: 512  },   // 0
    { dpr: 1.0, ao: false, bloom: true,  shadow: 1024 },   // 1
    { dpr: 1.25, ao: false, bloom: true, shadow: 1024 },   // 2
    { dpr: 1.5, ao: true,  bloom: true,  shadow: 1536 },   // 3
  ];

  setQuality(level){
    if (typeof level === 'string')
      level = { low: 1, medium: 2, high: 3 }[level] ?? 3;
    level = Math.max(0, Math.min(3, level | 0));
    this.quality = level;
    const q = Engine.LEVELS[level];
    this.maxDpr = q.dpr;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, q.dpr));
    if (this.gtao) this.gtao.enabled = q.ao;
    this.bloom.enabled = q.bloom;
    if (this.key && this.key.shadow.mapSize.width !== q.shadow){
      this.key.shadow.mapSize.set(q.shadow, q.shadow);
      this.key.shadow.map?.dispose();
      this.key.shadow.map = null;
    }
    this.resize();
    return level;
  }

  /* Step down when we're consistently missing frame budget. Never steps back up:
     oscillating between quality levels reads far worse than sitting one notch low. */
  _adapt(dt){
    if (!this.autoQuality) return;
    this._acc += dt; this._n++;
    if (this._acc < 1) return;
    const avg = this._acc / this._n;
    this._acc = 0; this._n = 0;
    if (this._grace > 0){ this._grace--; return; }
    if (avg > 1 / 45 && this.quality > 0){
      this.setQuality(this.quality - 1);
      this._grace = 2;
      this.onQualityChange?.(this.quality, Math.round(1 / avg));
    }
  }

  resize(){
    const w = innerWidth, h = innerHeight;
    this.camera.aspect = w / h;
    // pull back on narrow screens rather than widening the lens — changing fov
    // would change the pitch the player reads, dollying does not
    this.zoom = THREE.MathUtils.clamp(1.62 / this.camera.aspect, 1, 1.75);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    this.gtao?.setSize(w, h);
  }

  /** Follow a target with soft lag + look-ahead in the movement direction. */
  follow(pos, vel, dt){
    this.camLook.copy(pos).addScaledVector(vel, 0.34);
    if (this.arenaView){
      // The Foundry's distant eclipse needs a shallower, wider composition.
      // Still follow movement, keeping the pilot readable on narrow screens.
      this.camLook.multiplyScalar(0.55);
      this.camLook.z -= 4;
    }
    this.camLook.y = 0;
    this.camLook.x = THREE.MathUtils.clamp(this.camLook.x, -this.clampX, this.clampX);
    this.camLook.z = THREE.MathUtils.clamp(this.camLook.z, -this.clampZ, this.clampZ);
    this.camTarget.lerp(this.camLook, 1 - Math.pow(0.0016, dt));
    this._off.copy(this.camOffset).multiplyScalar(this.zoom * this.roomZoom);
    if (this.arenaView) this._off.set(0, 23, 29).multiplyScalar(Math.max(2.05, this.zoom * 1.45));
    this.camera.position.copy(this.camTarget).add(this._off);
    this.camera.lookAt(this.camTarget.x, this.camTarget.y + 1.1, this.camTarget.z);

    if (this.shake > 0.0008){
      this.shake *= Math.pow(0.0009, dt);
      const s = this.shake;
      this.camera.position.x += (Math.random() - 0.5) * s * 2.4;
      this.camera.position.y += (Math.random() - 0.5) * s * 1.6;
      this.camera.position.z += (Math.random() - 0.5) * s * 2.4;
    } else this.shake = 0;
  }

  /** Dolly back so the room you are standing in fits the frame. `clampW/D` are
      the whole floor, which is what the camera is allowed to travel across. */
  fitRoom(w, d, clampW = w, clampD = d){
    this.arenaView = false;
    this.roomZoom = THREE.MathUtils.clamp(Math.max(w / 34, d / 24), 1, 1.15);

    /* Follow the player anywhere on the floor. The previous clamp held the
       camera back so it would never show space past the walls — right when a
       room WAS the whole level, but a floor is now far wider than the camera can
       see, so that clamp pinned the camera and slid the player to the screen
       edge. Keeping the player centred matters more, and dark station beyond a
       wall is on-theme — it is already what the near and far edges show. */
    this.clampX = clampW / 2;
    this.clampZ = clampD / 2;
  }

  addShake(a){ this.shake = Math.min(this.shake + a, 0.5); }

  /* `postEnabled` exists because the post-processing chain can fail to present
     on some GPU/browser combinations while direct rendering is fine — the page
     composites black even though the frame was drawn. Falling back to a straight
     render loses bloom, AO and the grade, but a plain-looking game beats a black
     screen. `?nopost` forces it; setPost() lets the boot check flip it. */
  setPost(on){
    this.postEnabled = !!on;
    if (!on) this.renderer.setRenderTarget(null);
  }

  render(t, dt = 0){
    this.grade.uniforms.uTime.value = t;
    if (this.postEnabled === false){
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
    } else {
      this.composer.render();
    }
    if (dt) this._adapt(dt);
  }

  /** World position -> CSS pixels, for DOM elements pinned to entities. */
  project(v3, out){
    const p = v3.clone().project(this.camera);
    out.x = (p.x * 0.5 + 0.5) * innerWidth;
    out.y = (-p.y * 0.5 + 0.5) * innerHeight;
    return out;
  }
}
