// Day/night cycle: the sun and moon go round, the sky changes colour, stars come out.

import * as THREE from 'three';

export const DAY_LENGTH_SECONDS = 20 * 60;

const SKY_DAY = new THREE.Color('#7fb8ea'), HORIZON_DAY = new THREE.Color('#cfe4f2');
const SKY_SUNSET = new THREE.Color('#3d5a9a'), HORIZON_SUNSET = new THREE.Color('#f29a5c');
const SKY_NIGHT = new THREE.Color('#060a1c'), HORIZON_NIGHT = new THREE.Color('#141c38');

export class Sky {
  readonly group = new THREE.Group();
  readonly sun = new THREE.DirectionalLight('#fff4e0', 2.2);
  readonly moon = new THREE.DirectionalLight('#8fa6d8', 0.35);
  readonly ambient = new THREE.HemisphereLight('#bcd8ff', '#5a5040', 1.0);
  /** Inside an Interior: no sky, no sun, just a little dim light. */
  indoors = false;
  /** 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset. */
  time = 0.3;
  readonly horizon = new THREE.Color();
  private dome: THREE.Mesh;
  private stars: THREE.Points;
  private sunDisc: THREE.Mesh;
  private moonDisc: THREE.Mesh;
  private uniforms = { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } };

  constructor() {
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(9000, 24, 12),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying vec3 vDir;
          void main(){ float t = smoothstep(0.0, 0.6, vDir.y); gl_FragColor = vec4(mix(bottom, top, t), 1.0); }`,
      }),
    );
    this.dome.renderOrder = -10;

    const starPos: number[] = [];
    for (let i = 0; i < 1500; i++) {
      const v = new THREE.Vector3().randomDirection();
      if (v.y < 0.02) v.y = Math.abs(v.y) + 0.02;
      v.normalize().multiplyScalar(8500);
      starPos.push(v.x, v.y, v.z);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({
      color: '#ffffff', size: 2, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false,
    }));

    this.sunDisc = new THREE.Mesh(new THREE.CircleGeometry(260, 24), new THREE.MeshBasicMaterial({ color: '#fff3c4', fog: false }));
    this.moonDisc = new THREE.Mesh(new THREE.CircleGeometry(160, 24), new THREE.MeshBasicMaterial({ color: '#e6ecff', fog: false }));

    this.group.add(this.dome, this.stars, this.sunDisc, this.moonDisc, this.ambient, this.sun, this.moon, this.sun.target, this.moon.target);
  }

  update(dt: number, center: THREE.Vector3, scene: THREE.Scene) {
    this.time = (this.time + dt / DAY_LENGTH_SECONDS) % 1;
    const angle = (this.time - 0.25) * Math.PI * 2; // sunrise in the east
    const sunDir = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0.35).normalize();
    const elev = sunDir.y;

    // Blend day → sunset → night by how high the sun is.
    const day = THREE.MathUtils.smoothstep(elev, 0.0, 0.35);
    const dusk = 1 - Math.abs(THREE.MathUtils.clamp(elev / 0.25, -1, 1));
    const top = SKY_NIGHT.clone().lerp(SKY_DAY, day).lerp(SKY_SUNSET, dusk * 0.6);
    this.horizon.copy(HORIZON_NIGHT).lerp(HORIZON_DAY, day).lerp(HORIZON_SUNSET, dusk * 0.75);
    this.uniforms.top.value.copy(top);
    this.uniforms.bottom.value.copy(this.horizon);

    this.sun.intensity = 2.4 * THREE.MathUtils.smoothstep(elev, -0.05, 0.2);
    this.sun.color.set('#fff4e0').lerp(new THREE.Color('#ffb070'), dusk);
    this.moon.intensity = 0.45 * THREE.MathUtils.smoothstep(-elev, -0.05, 0.2);
    this.ambient.intensity = 0.25 + 0.85 * day;

    this.dome.position.copy(center);
    this.stars.position.copy(center);
    this.stars.rotation.z = angle * 0.5;
    (this.stars.material as THREE.PointsMaterial).opacity = 1 - THREE.MathUtils.smoothstep(elev, -0.15, 0.05);

    this.sun.position.copy(center).addScaledVector(sunDir, 3000);
    this.sun.target.position.copy(center);
    this.moon.position.copy(center).addScaledVector(sunDir, -3000);
    this.moon.target.position.copy(center);
    this.sunDisc.position.copy(center).addScaledVector(sunDir, 8000);
    this.sunDisc.lookAt(center);
    this.moonDisc.position.copy(center).addScaledVector(sunDir, -8000);
    this.moonDisc.lookAt(center);

    if (scene.fog) (scene.fog as THREE.Fog).color.copy(this.horizon);
    for (const o of [this.dome, this.stars, this.sunDisc, this.moonDisc]) o.visible = !this.indoors;
    if (this.indoors) {
      this.sun.intensity = this.moon.intensity = 0;
      this.ambient.intensity = 0.22;
      if (scene.fog) (scene.fog as THREE.Fog).color.set('#0b0807');
    }
  }
}
