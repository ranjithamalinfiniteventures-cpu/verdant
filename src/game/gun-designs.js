import * as THREE from 'three';
import { rbox, mat, emissive } from '../core/geo.js';

// Shared authored parts drive both the held model and the armory illustration.
// Dimensions and positions are in local weapon coordinates, firing along +Z.
const grip = [0.16,0.3,0.22,0,-0.2,-0.14,'dark'];
export const DESIGNS = {
 laser: { muzzle:0.82, parts:[grip,[.3,.25,.64,0,0,0,'shell'],[.16,.14,.55,0,0,.48,'dark'],[.08,.08,.62,0,.17,.12,'glow'],[.34,.08,.24,0,-.02,-.36,'steel'],[.23,.2,.09,0,0,.78,'glow']] },
 scatter: { muzzle:.76, parts:[grip,[.44,.3,.52,0,0,-.08,'shell'],[.15,.16,.75,-.14,.02,.35,'steel'],[.15,.16,.75,.14,.02,.35,'steel'],[.43,.18,.22,0,-.14,.31,'dark'],[.12,.07,.45,-.14,.13,.34,'glow'],[.12,.07,.45,.14,.13,.34,'glow'],[.32,.29,.25,0,-.03,-.43,'dark']] },
 rapid: { muzzle:.81, parts:[grip,[.34,.3,.52,0,0,-.13,'shell'],[.42,.35,.22,0,0,.21,'steel'],...[-1,1].flatMap(x=>[-1,1].map(y=>[.09,.09,.55,x*.11,y*.11,.55,'dark'])),[.38,.07,.24,0,.2,-.12,'glow'],[.32,.3,.25,0,-.23,-.1,'steel'],[.4,.07,.08,0,.15,.7,'glow']] },
 rail: { muzzle:1.14, parts:[grip,[.28,.24,.63,0,0,-.17,'shell'],[.11,.15,.98,-.14,0,.56,'steel'],[.11,.15,.98,.14,0,.56,'steel'],[.08,.08,1.05,0,0,.59,'glow'],[.18,.12,.28,0,.23,-.02,'dark'],[.09,.06,.14,0,.31,.01,'glow'],[.34,.24,.2,0,0,-.55,'dark']] },
 plasma: { muzzle:.72, parts:[grip,[.5,.38,.47,0,0,-.08,'shell'],[.3,.3,.3,0,0,.28,'glow'],[.1,.16,.52,-.25,0,.38,'steel'],[.1,.16,.52,.25,0,.38,'steel'],[.42,.08,.52,0,.23,.24,'dark'],[.42,.08,.52,0,-.23,.24,'dark'],[.15,.1,.35,0,.3,-.1,'glow'],[.32,.27,.22,0,0,-.4,'steel']] }
};
export function buildGun(id, color){
 const def=DESIGNS[id], group=new THREE.Group();
 const rotor = new THREE.Group(); rotor.position.z=.55;
 if (id === 'rapid') group.add(rotor);
 const palette={shell:mat(0x637b89,.36,.5),dark:mat(0x192733,.5,.35),steel:mat(0xc1d0d5,.28,.65),glow:emissive(color,1.2)};
 for(const [i,[w,h,d,x,y,z,m]] of def.parts.entries()){const mesh=new THREE.Mesh(rbox(w,h,d,.025,2),palette[m]);mesh.position.set(x,y,z);mesh.castShadow=true;if(id==='rapid' && i>=3 && i<=6){mesh.position.z-=.55;rotor.add(mesh)}else group.add(mesh)}
 const muzzle=new THREE.Object3D();muzzle.position.z=def.muzzle;group.add(muzzle);
 return {group,muzzle,rotor};
}
export function gunIllustration(id,color){
 const palette={shell:'#607d8b',dark:'#223542',steel:'#c3d9e1',glow:color};
 const project=(x,y,z)=>`${150+z*100+x*48},${72-y*100+x*25-z*10}`;
 const polys=[];
 for(const [w,h,d,x,y,z,m] of DESIGNS[id].parts){
  const v=(sx,sy,sz)=>project(x+sx*w/2,y+sy*h/2,z+sz*d/2);
  polys.push(`<g stroke="#06141e" stroke-width="1.2"><polygon fill="${palette[m]}" points="${v(-1,-1,-1)} ${v(-1,1,-1)} ${v(-1,1,1)} ${v(-1,-1,1)}"/><polygon fill="${palette[m]}" points="${v(-1,1,-1)} ${v(1,1,-1)} ${v(1,1,1)} ${v(-1,1,1)}"/><polygon fill="${palette[m]}" opacity=".7" points="${v(-1,-1,1)} ${v(-1,1,1)} ${v(1,1,1)} ${v(1,-1,1)}"/></g>`);
 }
 return `<svg viewBox="0 0 320 140" role="img" aria-label="${id} gun design"><ellipse cx="165" cy="115" rx="90" ry="9" fill="#020b13" opacity=".5"/>${polys.join('')}</svg>`;
}
