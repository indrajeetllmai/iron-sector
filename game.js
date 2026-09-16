import * as THREE from './three.module.js';

const $=id=>document.getElementById(id);
const canvas=$('world');let touch=matchMedia('(pointer:coarse)').matches;
function setTouchMode(enabled){touch=enabled;document.body.classList.toggle('touch-mode',touch);$('control-mode').value=touch?'touch':'desktop'}
const weapons=[{name:'AK-47',damage:36,rate:.115,mag:30,reload:2.25,recoil:.027,spread:.012,auto:true},{name:'M4A1',damage:27,rate:.082,mag:30,reload:1.85,recoil:.018,spread:.009,auto:true},{name:'SR-25',damage:78,rate:.34,mag:20,reload:2.65,recoil:.044,spread:.004,auto:false},{name:'MP5',damage:21,rate:.065,mag:30,reload:1.65,recoil:.014,spread:.018,auto:true,falloff:.018,minRange:.38},{name:'SCAR-H',damage:44,rate:.16,mag:20,reload:2.5,recoil:.034,spread:.01,auto:true},{name:'M870',damage:19,rate:.85,mag:8,reload:3.2,recoil:.075,spread:.13,auto:false,pellets:8,falloff:.035,minRange:.18}];
let renderer;
try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});}catch(e){$('loading').hidden=true;$('error').hidden=false;throw e}
renderer.setPixelRatio(Math.min(devicePixelRatio,touch?1.25:1.8));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
const scene=new THREE.Scene();scene.background=new THREE.Color('#9eafba');scene.fog=new THREE.FogExp2('#b9bbae',.009);
const camera=new THREE.PerspectiveCamera(73,innerWidth/innerHeight,.05,220);camera.rotation.order='YXZ';scene.add(camera);
const hemi=new THREE.HemisphereLight('#d8e4f1','#625647',2.35);scene.add(hemi);
const sun=new THREE.DirectionalLight('#fff1c9',3.1);sun.position.set(-40,32,-22);sun.castShadow=true;sun.shadow.mapSize.set(touch?1024:2048,touch?1024:2048);sun.shadow.camera.left=-45;sun.shadow.camera.right=45;sun.shadow.camera.top=45;sun.shadow.camera.bottom=-45;sun.shadow.camera.far=140;sun.shadow.bias=-.0006;scene.add(sun);scene.add(sun.target);
let seed=4806;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
function surface(base,grain,lines=false){const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');x.fillStyle=base;x.fillRect(0,0,256,256);for(let i=0;i<14000;i++){const v=random()*grain;x.fillStyle=`rgba(${random()>.5?'255,255,255':'0,0,0'},${v})`;x.fillRect(random()*256,random()*256,random()*3+1,random()*3+1)}if(lines){x.strokeStyle='#11111128';for(let y=0;y<256;y+=64){x.beginPath();x.moveTo(0,y);x.lineTo(256,y);x.stroke();for(let a=(y%128?0:32);a<256;a+=64){x.beginPath();x.moveTo(a,y);x.lineTo(a,y+64);x.stroke()}}}const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;}
const concreteTex=surface('#9a9481',.19,true),roadTex=surface('#6e7169',.23),rustTex=surface('#847665',.27);
const mat=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.88,...extra});
const concrete=mat('#b8b5a5',{map:concreteTex}),darkConcrete=mat('#73776d',{map:concreteTex}),steel=mat('#4c5e60',{map:rustTex,metalness:.3}),rust=mat('#937058',{map:rustTex}),black=mat('#353d3d',{metalness:.28,roughness:.42}),wood=mat('#79573b',{map:rustTex}),tan=mat('#7b7d5d'),sand=mat('#aaa18a'),white=mat('#c8c6b2'),glass=mat('#243e42',{metalness:.7,roughness:.2});
concrete.bumpMap=concreteTex;concrete.bumpScale=.075;darkConcrete.bumpMap=concreteTex;darkConcrete.bumpScale=.06;wood.bumpMap=rustTex;wood.bumpScale=.025;
let obstacles=[],walls=[],worldRoot;const bots=[],effects=[];
const maps=[{name:'Outpost',tag:'INDUSTRIAL / BALANCED',description:'Concrete cover, open sightlines and service lanes.'},{name:'Dockyard',tag:'SHIPPING YARD / CLOSE QUARTERS',description:'Weave through cargo lanes and flank around the loading yard.'},{name:'Sandstone',tag:'DESERT COMPOUND / LONG RANGE',description:'Sunlit courtyards, thick stone walls and broken sightlines.'}];
let mapIndex=0;const mapCache=new Map();
// Batch fixed geometry by material to keep phone draw-call counts low.
function mergeMeshes(parent,skip=[]){
 const groups=new Map();
 for(const mesh of [...parent.children]){
  if(!mesh.isMesh||skip.includes(mesh)||Array.isArray(mesh.material)||!mesh.material.isMeshStandardMaterial)continue;
  const m=mesh.material,key=[m.color.getHex(),m.map?.uuid,m.bumpMap?.uuid,m.bumpScale,m.metalness,m.roughness,m.emissive.getHex(),m.emissiveIntensity,m.transparent,m.opacity].join('/');
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(mesh);
 }
 for(const list of groups.values()){
  if(list.length<2)continue;
  const geometries=list.map(mesh=>{mesh.updateMatrix();const g=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();return g.applyMatrix4(mesh.matrix)});
  const merged=new THREE.BufferGeometry();
  for(const name of ['position','normal','uv']){
   const size=name==='uv'?2:3,total=geometries.reduce((n,g)=>n+g.attributes.position.count*size,0),data=new Float32Array(total);let offset=0;
   for(const g of geometries){if(g.attributes[name])data.set(g.attributes[name].array,offset);offset+=g.attributes.position.count*size}
   merged.setAttribute(name,new THREE.BufferAttribute(data,size));
  }
  merged.computeBoundingSphere();const mesh=new THREE.Mesh(merged,list[0].material);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);
  for(const old of list){parent.remove(old);if(!walls.includes(old))old.geometry.dispose()}
  geometries.forEach(g=>g.dispose());
 }
}
function roundedBox(w,h,d,x,y,z,m,parent){
 const shape=new THREE.Shape();shape.moveTo(-w/2,-h/2);shape.lineTo(w/2,-h/2);shape.lineTo(w/2,h/2);shape.lineTo(-w/2,h/2);shape.closePath();
 const r=Math.min(w,h,d)*.12,g=new THREE.ExtrudeGeometry(shape,{depth:d-2*r,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:r,bevelThickness:r});g.translate(0,0,-d/2+r);
 const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;parent.add(o);return o;
}
function box(w,h,d,x,y,z,m,parent=worldRoot,collision=false){const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);if(collision){obstacles.push({x,z,w,d,h:y+h/2});walls.push(o)}return o;}
function cylinder(r1,r2,h,x,y,z,m,parent=worldRoot,sides=12){const o=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,sides),m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
function buildMap(index){
function building(x,z,w,d,h){box(w,h,d,x,h/2,z,concrete,worldRoot,true);box(w+.45,.3,d+.45,x,h,z,darkConcrete);box(w,.45,d+.1,x,.25,z,darkConcrete);for(let j=-w/2+1.6;j<w/2;j+=3){for(let y=2.4;y<h-.7;y+=2.8){box(1.4,1.5,.09,x+j,y,z+d/2+.06,black);box(1.2,1.3,.1,x+j,y,z+d/2+.12,glass);box(1.45,.08,.18,x+j,y-.7,z+d/2+.18,white);box(.055,1.3,.12,x+j,y,z+d/2+.2,darkConcrete)}}box(1.6,2.6,.15,x,1.3,z+d/2+.13,steel);for(let a=-w/2;a<=w/2;a+=w){box(.25,h,.3,x+a,h/2,z+d/2+.15,darkConcrete)}for(let n=0;n<3;n++){box(1.3,.7,1.5,x-w/3+n*w/3,h+.5,z,steel)}return h}
function container(x,z,length,color,along=false){const m=mat(color,{map:rustTex,metalness:.3});const w=along?length:3,d=along?3:length;box(w,2.8,d,x,1.4,z,m,worldRoot,true);box(w+.08,.12,d+.08,x,2.82,z,darkConcrete);const count=Math.round(length/.38);for(let i=0;i<count;i++){const p=-length/2+i*.38;if(along){box(.055,2.7,.05,x+p,1.4,z+1.52,m);box(.055,2.7,.05,x+p,1.4,z-1.52,m)}else{box(.05,2.7,.055,x+1.52,1.4,z+p,m);box(.05,2.7,.055,x-1.52,1.4,z+p,m)}}for(const a of [-.72,.72]){if(along){box(.07,2.5,.07,x+w/2+.06,1.4,z+a,black)}else{box(.07,2.5,.07,x+a,1.4,z+d/2+.06,black)}}}
function barrier(x,z,w=4){box(w,1.15,.8,x,.58,z,concrete,worldRoot,true);box(w+.2,.25,1.2,x,.125,z,darkConcrete);for(let i=-w/2+.4;i<w/2;i+=.8){const stripe=box(.35,.18,.015,x+i,.85,z+.41,mat('#aa9a54'));stripe.rotation.z=.35;}}
function sign(text,x,y,z,w=5){const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='#26342e';ctx.fillRect(0,0,512,128);ctx.strokeStyle='#b5ba9b';ctx.strokeRect(8,8,496,112);ctx.fillStyle='#d8dcc7';ctx.font='bold 56px sans-serif';ctx.textAlign='center';ctx.fillText(text,256,83);const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,w/4),new THREE.MeshStandardMaterial({map:new THREE.CanvasTexture(c)}));mesh.position.set(x,y,z);worldRoot.add(mesh)}
if(index===0){
const groundMap=roadTex.clone();groundMap.repeat.set(22,22);groundMap.needsUpdate=true;box(200,.3,200,0,-.16,0,mat('#b9b7a2',{map:groundMap}));
// Concrete perimeter, service buildings, and traversable lanes.
box(62,3,.6,0,1.5,-35,concrete,worldRoot,true);box(62,3,.6,0,1.5,35,concrete,worldRoot,true);box(.6,3,70,-31,1.5,0,concrete,worldRoot,true);box(.6,3,70,31,1.5,0,concrete,worldRoot,true);
for(let x=-30;x<=30;x+=6){box(.35,3.4,.8,x,1.7,-35,darkConcrete);box(.35,3.4,.8,x,1.7,35,darkConcrete)}
building(-23,-16,15,23,9);building(24,-20,12,20,12);building(-25,24,10,14,6);building(25,20,12,12,7);
// Distant silhouettes provide depth beyond the playable yard.
for(let i=0;i<20;i++){const x=(random()-.5)*150,z=-45-random()*30,h=7+random()*14;box(5+random()*8,h,7,x,h/2,z,mat('#7e8982'))}
container(-10,4,10,'#4f6665');container(9,-12,10,'#8b644b');container(8,14,8,'#67715d',true);container(-7,-22,8,'#5b6260',true);
barrier(-4,15);barrier(14,1,5);barrier(-3,-7,4);barrier(-15,25,4);barrier(6,29,4);
for(const [x,z] of [[-15,-6],[15,-24],[-5,-14],[18,11],[-15,14],[2,1]]){box(1.4,1.3,1.4,x,.65,z,wood,worldRoot,true);for(let y of [.2,1.1])box(1.45,.13,1.45,x,y,z,tan);box(.12,1.3,1.43,x,.65,z,tan);if(random()>.45){box(1.2,1.1,1.2,x,1.86,z,wood,worldRoot,true)}}
for(const [x,z] of [[-16,5],[15,-6],[1,-25],[16,24]]){cylinder(.47,.47,1.3,x,.65,z,rust);obstacles.push({x,z,w:1,d:1,h:1.3});for(let y of [.12,.65,1.17])cylinder(.48,.48,.05,x,y,z,black)}
// Power lines, fixtures, road markings, scrub and a watchtower.
for(const x of [-19,19]){for(const z of [-30,3,30]){cylinder(.09,.15,9,x,4.5,z,darkConcrete);box(2,.1,.12,x,8.7,z,black);const lamp=box(.7,.12,.35,x+.5,8.3,z,mat('#ede3ad',{emissive:'#d7c57b',emissiveIntensity:.5}));const points=[new THREE.Vector3(x,8.6,z),new THREE.Vector3(x,7.8,z-15),new THREE.Vector3(x,8.6,z-30)];const curve=new THREE.CatmullRomCurve3(points);worldRoot.add(new THREE.Mesh(new THREE.TubeGeometry(curve,14,.018,4,false),black))}}
for(let z=-29;z<32;z+=5)box(.16,.01,2.3,0,.015,z,mat('#b9ad7b'));
for(let i=0;i<90;i++){const x=(random()-.5)*58,z=(random()-.5)*66;const r=.05+random()*.15;const stone=new THREE.Mesh(new THREE.DodecahedronGeometry(r),darkConcrete);stone.position.set(x,.06,z);worldRoot.add(stone)}
for(let i=0;i<65;i++){const x=(random()>.5?1:-1)*(28+random()*2),z=(random()-.5)*66;for(let k=0;k<3;k++){const leaf=box(.025,.2+random()*.3,.08,x+(random()-.5)*.2,.14,z+(random()-.5)*.2,mat('#676b48'));leaf.rotation.z=(random()-.5)}}
for(let x of [10,14])for(let z of [-31,-27])box(.18,7,.18,x,3.5,z,black);box(4.8,.3,4.8,12,5.4,-29,wood);box(4.7,.2,4.7,12,8,-29,steel);for(let x of [9.7,14.3])box(.12,2.6,4.7,x,6.7,-29,steel);box(4.5,1,0.12,12,5.9,-31.3,steel);
sign('SECTOR 07',-23,5.6,-4.43,6);sign('RESTRICTED',0,2,-34.65,5);

// Shallow road repairs, drains and ground wear break up the uniform yard.
const repairMat=mat('#51574f',{map:roadTex,bumpMap:roadTex,bumpScale:.025});
for(const [x,z,w,d] of [[-2,8,3,5],[3,-5,4,2],[-15,20,3,4],[11,-26,4,3]])box(w,.014,d,x,.012,z,repairMat);
for(const z of [-17,17]){box(1.25,.035,.7,16,.02,z,black);for(let i=0;i<8;i++)box(.065,.045,.68,15.48+i*.15,.035,z,steel)}
const skid=mat('#565951',{transparent:true,opacity:.42});for(const x of [2.5,3.7])for(let z=-27;z<29;z+=2.5)box(.18,.008,1.9,x,.025,z,skid);

}else{
 const groundMap=roadTex.clone();groundMap.repeat.set(22,22);groundMap.needsUpdate=true;
 const desert=index===2,stone=mat(desert?'#c7a47d':'#87908c',{map:concreteTex});
 box(200,.3,200,0,-.16,0,mat(desert?'#cfb48a':'#727c7d',{map:groundMap}));
 box(62,3,.6,0,1.5,-35,stone,worldRoot,true);box(62,3,.6,0,1.5,35,stone,worldRoot,true);box(.6,3,70,-31,1.5,0,stone,worldRoot,true);box(.6,3,70,31,1.5,0,stone,worldRoot,true);
 if(!desert){
  for(const [x,z,l,c,h] of [[-15,-15,12,'#3f6571',false],[15,-15,12,'#a36848',false],[-15,9,12,'#547471',false],[15,9,12,'#756548',false],[-4,-7,8,'#5b6976',true],[5,8,8,'#985f46',true],[-23,-2,9,'#927251',false],[24,0,10,'#426776',false]])container(x,z,l,c,h);
  for(const [x,z] of [[-5,18],[8,-21],[-24,20],[24,-24]]){box(2,1.2,2,x,.6,z,wood,worldRoot,true);box(2.1,.12,2.1,x,.1,z,tan)}
  barrier(0,1,4);barrier(-9,26,4);barrier(11,28,4);
  for(const x of [-27,27]){box(.7,17,.7,x,8.5,-11,steel,worldRoot,true);box(7,.5,.6,x,17,-11,steel);cylinder(.04,.04,12,x+2,11,-11,black)}
  box(55,.65,1,0,17,-11,mat('#c79b48'));
  for(let z=-28;z<30;z+=5){box(.15,.01,2,0,.02,z,white);for(const x of [-20,20])box(3,.01,.12,x,.02,z,white)}
  for(const x of [-45,45])box(18,8,55,x,4,0,steel);
  sign('DOCK 09',0,2,-34.65,7);
 }else{
  for(const [x,z,w,d,h] of [[-24,-14,11,20,7],[24,-17,11,16,9],[-24,16,10,16,6],[24,17,10,13,7]]){box(w,h,d,x,h/2,z,stone,worldRoot,true);box(w+.5,.25,d+.5,x,h,z,sand);for(let dx=-3;dx<=3;dx+=3){box(1.1,1.4,.07,x+dx,3.3,z+d/2+.05,black);box(1.3,.18,.5,x+dx,2.6,z+d/2+.22,sand)}}
  for(const [x,z,w,d] of [[-10,-15,1,10],[10,12,1,10],[-9,9,7,1],[9,-10,7,1],[-4,0,1,7],[5,0,1,7]]){box(w,2.6,d,x,1.3,z,stone,worldRoot,true);box(w+.15,.18,d+.15,x,2.66,z,sand)}
  box(3,1.1,3,0,.55,0,stone,worldRoot,true);box(3.4,.15,3.4,0,1.13,0,sand);
  for(const [x,z] of [[-10,21],[11,-23],[-14,-2],[14,1]]){box(3,1,1,x,.5,z,sand,worldRoot,true);for(let i=-1;i<=1;i++)box(.85,.22,1.1,x+i,1.03,z,tan)}
  for(const x of [-17,17])for(const z of [-27,26]){cylinder(.19,.3,6,x,3,z,wood);for(let i=0;i<6;i++){const leaf=box(.75,.08,4,x,5.8,z,mat('#62764c'));leaf.rotation.y=i*Math.PI/3;leaf.rotation.z=.15}}
  for(let i=0;i<18;i++){const h=6+random()*9;box(6,h,6,(i-9)*7,h/2,-45-random()*15,stone)}
  sign('SANDSTONE',0,2,-34.65,7);
 }
}
// Soft sky gradient and low sun create depth without expensive post-processing.
const sky=new THREE.Mesh(new THREE.SphereGeometry(160,24,12),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{zenith:{value:new THREE.Color('#7d9aae')},horizon:{value:new THREE.Color('#d2c8a9')}},vertexShader:'varying vec3 vPos; void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'varying vec3 vPos;uniform vec3 zenith;uniform vec3 horizon;void main(){float h=clamp(normalize(vPos).y*1.6,0.0,1.0);gl_FragColor=vec4(mix(horizon,zenith,h),1.0);}'}));worldRoot.add(sky);


if(index===1){sky.material.uniforms.zenith.value.set('#688798');sky.material.uniforms.horizon.value.set('#bbc7c7')}if(index===2){sky.material.uniforms.zenith.value.set('#92b9cd');sky.material.uniforms.horizon.value.set('#edd3a2')}
worldRoot.updateMatrixWorld(true);mergeMeshes(worldRoot);
}
function loadMap(index){
 if(!Number.isInteger(index)||!maps[index])return false;
 if(worldRoot)worldRoot.visible=false;
 if(!mapCache.has(index)){worldRoot=new THREE.Group();scene.add(worldRoot);obstacles=[];walls=[];buildMap(index);mapCache.set(index,{root:worldRoot,obstacles,walls})}
 const selected=mapCache.get(index);worldRoot=selected.root;obstacles=selected.obstacles;walls=selected.walls;worldRoot.visible=true;mapIndex=index;
 scene.fog.color.set(index===2?'#d5bd95':index===1?'#aabcc1':'#b9bbae');sun.color.set(index===2?'#ffe4ab':index===1?'#dfecf4':'#fff1c9');
 return true;
}
function selectMap(index){if(state!=='menu'||!loadMap(index))return false;maps.forEach((m,i)=>{$('map-'+i).setAttribute('aria-pressed',String(i===index));$('map-'+i).classList.toggle('selected',i===index)});const m=maps[index];$('map-select').value=String(index);$('map-description').textContent=m.description;$('operation').textContent='OPERATION 0'+(index+1)+' / '+m.name.toUpperCase();$('map-tag').textContent=m.tag;$('hud-map').textContent=$('overlay-eyebrow').textContent='OPERATION '+m.name.toUpperCase();$('deploy-label').textContent='DEPLOY TO '+m.name.toUpperCase();return true}
loadMap(0);

// Procedural weapon models remain part of the live 3D scene.
const gun=new THREE.Group();camera.add(gun);gun.scale.setScalar(.78);let flash,muzzleLight;
function weaponModel(type,parent,detailed=true){const g=new THREE.Group();parent.add(g);const receiver=type===0?black:mat(type===4?'#ad986e':'#353b35',{metalness:.7,roughness:.35});roundedBox(.13,.18,.5,0,0,-.2,receiver,g);box(.12,.08,.4,0,.12,-.24,black,g);box(.1,.2,.2,0,-.09,.04,type===0?wood:receiver,g).rotation.x=-.2;roundedBox(.14,.13,.31,0,0,.28,type===0?wood:receiver,g);roundedBox(.15,.22,.055,0,-.02,.45,black,g);const barrel=cylinder(.028,.03,type===2?.62:.43,0,.01,type===2?-.94:-.77,black,g);barrel.rotation.x=Math.PI/2;box(.14,.14,.38,0,0,-.53,type===0?wood:receiver,g);const mag=box(.095,.3,.17,0,-.22,-.24,black,g);mag.rotation.x=type===0?-.22:.05;box(.018,.15,.07,.065,-.13,-.03,black,g);box(.11,.04,.12,0,-.19,-.02,black,g);box(.025,.15,.035,0,.12,-.8,black,g);box(.12,.025,.05,0,.2,-.24,black,g);if(type===2){const scope=cylinder(.055,.055,.35,0,.23,-.25,black,g);scope.rotation.x=Math.PI/2;box(.09,.12,.08,0,.13,-.3,black,g)}else{box(.09,.045,.06,0,.17,-.04,black,g);box(.025,.025,.018,0,.202,-.035,white,g)}if(type===3){g.scale.set(.9,.9,.78);box(.025,.15,.5,-.065,0,.4,black,g);box(.025,.15,.5,.065,0,.4,black,g)}if(type===4){box(.19,.14,.45,0,.025,-.52,receiver,g);box(.08,.15,.12,.09,0,.27,black,g)}if(type===5){g.remove(mag);mag.geometry.dispose();const tube=cylinder(.035,.035,.65,0,-.07,-.74,black,g);tube.rotation.x=Math.PI/2;box(.18,.16,.28,0,-.035,-.69,wood,g);for(let z=-.79;z<-.55;z+=.035)box(.19,.02,.012,0,.04,z,black,g)}if(detailed){for(let z=-.69;z<-.37;z+=.05)box(.15,.014,.02,0,.08,z,black,g);for(let z=-.35;z<-.05;z+=.045)box(.14,.02,.02,0,.16,z,receiver,g);box(.028,.025,.16,.081,.02,-.19,steel,g);cylinder(.017,.017,.008,.075,0,-.07,steel,g,8).rotation.z=Math.PI/2;box(.12,.1,.06,.065,-.03,.04,tan,g);const hand=box(.11,.13,.17,-.05,-.08,-.52,tan,g);hand.rotation.z=-.3;const sleeve=box(.13,.14,.38,-.13,-.19,-.28,tan,g);sleeve.rotation.x=-.45;sleeve.rotation.z=.45;const arm=box(.15,.18,.42,.12,-.17,.3,tan,g);arm.rotation.x=-.25}
mergeMeshes(g);return g}
let weaponIndex=0,gunMesh;
function setWeapon(i,notify=true){weaponIndex=i;if(gunMesh){gun.remove(gunMesh);gunMesh.traverse(o=>o.geometry?.dispose())}gunMesh=weaponModel(i,gun);gunMesh.traverse(o=>{o.castShadow=false;o.receiveShadow=false});if(flash){flash.geometry.dispose();flash.material.dispose()}flash=new THREE.Mesh(new THREE.SphereGeometry(.09,6,4),new THREE.MeshBasicMaterial({color:'#ffe2a0',transparent:true,opacity:.85}));flash.position.set(0,.01,i===2?-1.28:i===3?-.8:-1.02);flash.scale.set(.6,.6,2.5);flash.visible=false;gunMesh.add(flash);muzzleLight??=new THREE.PointLight('#ffbc66',0,4);gun.add(muzzleLight);muzzleLight.position.set(0,0,-1);reloadTimer=0;recoil=0;document.querySelectorAll('[data-weapon]').forEach((el,n)=>{el.classList.toggle('selected',n===i);el.setAttribute('aria-pressed',String(n===i))});if(notify&&state==='playing')message(weapons[i].name,1);updateHUD()}
let state='menu',health=100,kills=0,elapsed=0,yaw=0,pitch=0,ammo=weapons.map(w=>w.mag),reserve=weapons.map(w=>w.mag*6),cooldown=0,reloadTimer=0,recoil=0,aim=false,trigger=false,shotLatch=false,damageFade=0,lastDamage=-100,hitTime=0,noticeTime=0,footTime=0,totalShots=0,totalHits=0,crouched=false,touchSprint=false,shotBloom=0;
let feetY=0,verticalVelocity=0,grounded=true,eyeHeight=1.7,slideTimer=0,slideCooldown=0,slideYaw=0;
const arrowPressTime=new Map(),arrowReleaseTime=new Map();
const keys=new Set(),player=new THREE.Vector3(0,1.7,28),ray=new THREE.Raycaster(),v=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
let audioCtx,muted=false;
function audio(){if(!audioCtx){audioCtx=new(window.AudioContext||window.webkitAudioContext)()}if(audioCtx.state==='suspended')audioCtx.resume()}
function sound(kind){if(muted||!audioCtx)return;const t=audioCtx.currentTime;const g=audioCtx.createGain();g.connect(audioCtx.destination);if(kind==='shot'||kind==='enemy'||kind==='step'){const dur=kind==='step'?.08:.17;const b=audioCtx.createBuffer(1,audioCtx.sampleRate*dur,audioCtx.sampleRate);const d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.exp(-i/d.length*7);const s=audioCtx.createBufferSource();s.buffer=b;const f=audioCtx.createBiquadFilter();f.type='lowpass';f.frequency.value=kind==='step'?200:kind==='enemy'?700:weaponIndex===2?1900:2600;s.connect(f);f.connect(g);g.gain.value=kind==='step'?.11:kind==='enemy'?.085:.28;s.start(t)}else{const o=audioCtx.createOscillator();o.type='triangle';o.frequency.setValueAtTime(kind==='hit'?850:kind==='reload'?250:110,t);o.frequency.exponentialRampToValueAtTime(80,t+.09);g.gain.setValueAtTime(.06,t);g.gain.exponentialRampToValueAtTime(.001,t+.12);o.connect(g);o.start(t);o.stop(t+.13)}}
function occupied(x,z,r=.38,feet=0){if(Math.abs(x)>30.2||Math.abs(z)>34.2)return true;return obstacles.some(o=>o.h>feet+.015&&x>o.x-o.w/2-r&&x<o.x+o.w/2+r&&z>o.z-o.d/2-r&&z<o.z+o.d/2+r)}
function move(pos,dx,dz,r=.38,feet=0){if(!occupied(pos.x+dx,pos.z,r,feet))pos.x+=dx;if(!occupied(pos.x,pos.z+dz,r,feet))pos.z+=dz}
function forwardInput(){return Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown'))-joystick.y}
function sprintHeld(){return keys.has('ShiftLeft')||keys.has('ShiftRight')||touchSprint}
function jump(){
 if(!canControl()||!grounded||slideTimer>0)return;
 verticalVelocity=7.5;grounded=false;crouched=false;message(touch?'JUMP':'JUMP · E',.6);updateHUD();
}
function startSlide(){
 if(!canControl())return;
 if(slideCooldown>0){message('SLIDE RECOVERING',.6);return}
 if(!grounded||!sprintHeld()||forwardInput()<.25||aim||crouched){message(touch?'RUN + PUSH FORWARD, THEN TAP SLIDE':'HOLD W + SHIFT, THEN TAP C TO SLIDE',2);return}
 slideTimer=.75;slideCooldown=1.6;slideYaw=yaw;aim=false;crouched=false;touchSprint=false;message('SLIDING',.7);updateHUD();
}
function supportHeight(){
 let height=0;
 for(const o of obstacles){if(o.h<=feetY+.025&&Math.abs(player.x-o.x)<o.w/2+.36&&Math.abs(player.z-o.z)<o.d/2+.36)height=Math.max(height,o.h)}
 return height;
}
function updateVertical(dt){
 const support=supportHeight();
 if(!grounded||feetY>support+.025){
  grounded=false;feetY+=verticalVelocity*dt-9.5*dt*dt;verticalVelocity-=19*dt;
  if(feetY<=support){feetY=support;verticalVelocity=0;grounded=true;sound('step')}
 }else{feetY=support;verticalVelocity=0;grounded=true}
 eyeHeight=THREE.MathUtils.damp(eyeHeight,slideTimer>0?.78:crouched?1.05:1.7,15,dt);player.y=feetY+eyeHeight;
}
function resetMovement(){feetY=0;verticalVelocity=0;grounded=true;eyeHeight=1.7;slideTimer=0;slideCooldown=0;slideYaw=0}
const gridSize=2,NX=30,NZ=34;
const node=(x,z)=>({x:Math.max(0,Math.min(NX-1,Math.floor((x+30)/2))),z:Math.max(0,Math.min(NZ-1,Math.floor((z+34)/2)))});
const cell=(x,z)=>({x:x*2-29,z:z*2-33});
function pathTo(from,to){const s=node(from.x,from.z),e=node(to.x,to.z),sid=s.z*NX+s.x,eid=e.z*NX+e.x;const open=[sid],g=new Map([[sid,0]]),parent=new Map(),done=new Set();let count=0;while(open.length&&count++<1000){open.sort((a,b)=>(g.get(a)+Math.abs(a%NX-e.x)+Math.abs(Math.floor(a/NX)-e.z))-(g.get(b)+Math.abs(b%NX-e.x)+Math.abs(Math.floor(b/NX)-e.z)));const id=open.shift();if(id===eid){const p=[];let k=id;while(k!==sid){p.push(cell(k%NX,Math.floor(k/NX)));k=parent.get(k);if(k===undefined)return []}return p.reverse()}done.add(id);const x=id%NX,z=Math.floor(id/NX);for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){const a=x+dx,b=z+dz,k=b*NX+a;if(a<0||a>=NX||b<0||b>=NZ||done.has(k))continue;const c=cell(a,b);if(occupied(c.x,c.z,.43))continue;const ng=g.get(id)+1;if(!g.has(k)||ng<g.get(k)){g.set(k,ng);parent.set(k,id);if(!open.includes(k))open.push(k)}}}return []}
function clearSight(from,to){v.copy(to).sub(from);const dist=v.length();ray.set(from,v.normalize());ray.far=dist;return ray.intersectObjects(walls,false).length===0}
const enemySpawns=[[-15,-31],[-9,-31],[-1,-29],[7,-25],[17,-29]];
const allySpawns=[[-12,26],[-6,23],[4,23],[15,25]];
const allyNames=['ATLAS','BISHOP','NOMAD','ROOK'];
function teamAlive(team){return bots.filter(b=>b.team===team&&b.alive).length+(team==='blue'&&health>0?1:0)}
function checkRound(){if(state!=='playing')return;if(teamAlive('red')===0)finish(true);else if(teamAlive('blue')===0)finish(false)}
function eliminate(b,source){if(!b.alive)return;b.health=0;b.alive=false;b.death=.001;b.marker.visible=false;const line=document.createElement('div');line.textContent=source+' / '+b.name;$('killfeed').prepend(line);while($('killfeed').children.length>3)$('killfeed').lastElementChild.remove();checkRound()}
function teamMarker(name,team){const c=document.createElement('canvas');c.width=256;c.height=64;const ctx=c.getContext('2d');ctx.fillStyle=team==='blue'?'#86d9ff':'#f2aa88';ctx.font='bold 23px sans-serif';ctx.textAlign='center';ctx.fillText(name,128,39);const marker=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),depthTest:true,transparent:true}));marker.raycast=()=>{};marker.position.y=2.5;marker.scale.set(2.4,.6,1);return marker}
function makeBot(x,z,index,team){const group=new THREE.Group();group.position.set(x,0,z);scene.add(group);const uniform=mat(team==='blue'?'#45616b':'#80664d',{map:rustTex}),armor=mat(team==='blue'?'#354e56':'#5a4837'),skin=mat('#a28a6a');const torso=box(.58,.68,.31,0,1.18,0,uniform,group);box(.51,.46,.38,0,1.24,-.01,armor,group);for(let xx of [-.16,0,.16])box(.12,.16,.09,xx,1.15,-.24,tan,group);const head=new THREE.Mesh(new THREE.SphereGeometry(.18,10,8),skin);head.position.set(0,1.78,0);head.scale.set(.9,1.1,1);group.add(head);const helmet=new THREE.Mesh(new THREE.SphereGeometry(.21,10,8,0,Math.PI*2,0,1.75),armor);helmet.position.set(0,1.83,.02);group.add(helmet);box(.31,.07,.06,0,1.82,-.17,black,group);box(.27,.15,.13,0,1.65,-.08,armor,group);const limbs=[];for(let side of [-1,1]){const leg=new THREE.Group();leg.position.set(side*.16,.84,0);group.add(leg);box(.22,.69,.24,0,-.34,0,uniform,leg);box(.24,.18,.36,0,-.74,-.05,black,leg);limbs.push(leg);const arm=box(.19,.58,.23,side*.37,1.22,-.09,uniform,group);arm.rotation.x=-.65;arm.rotation.z=side*.18;box(.13,.15,.14,side*.24,1.05,-.32,skin,group)}const rifle=weaponModel(1,group,false);rifle.position.set(.18,1.22,-.32);rifle.scale.setScalar(.75);const name=team==='blue'?allyNames[index]:'OPPONENT '+(index+1);const marker=teamMarker(name,team);group.add(marker);marker.visible=team==='blue';for(const side of [-1,1])box(.2,.09,.25,side*.38,1.4,-.04,mat(team==='blue'?'#53c8f5':'#ce7351'),group);mergeMeshes(group,[head,helmet]);const b={group,head,team,name,marker,home:new THREE.Vector3(x,0,z),health:100,alive:true,limbs,index,path:[],pathTimer:random(),fireTimer:1+random()*2,target:null,lastSeen:null,alert:0,walk:0,death:0};group.traverse(o=>{if(o.isMesh){o.userData.bot=b;o.castShadow=true}});head.userData.head=true;bots.push(b);return b}
function resetBots(){for(const b of bots){scene.remove(b.group);b.group.traverse(o=>o.geometry?.dispose())}bots.length=0;allySpawns.forEach(([x,z],i)=>makeBot(x,z,i,'blue'));enemySpawns.forEach(([x,z],i)=>makeBot(x,z,i,'red'));scene.updateMatrixWorld(true)}
function message(s,d=2){$('notification').textContent=s;noticeTime=d}
function updateHUD(){const w=weapons[weaponIndex];$('touch-aim').setAttribute('aria-pressed',String(aim));$('touch-crouch').setAttribute('aria-pressed',String(crouched));$('touch-sprint').setAttribute('aria-pressed',String(touchSprint));$('touch-swap').textContent=w.name;$('posture').textContent=slideTimer>0?'SLIDING':!grounded?'AIRBORNE':crouched?'CROUCHED':touchSprint?'SPRINT READY':'STANDING';$('touch-slide').textContent=slideTimer>0?'SLIDING':slideCooldown>0?'WAIT':'SLIDE';$('touch-slide').setAttribute('aria-pressed',String(slideTimer>0));$('kills').textContent=`${teamAlive('blue')} BLUE  /  ${teamAlive('red')} RED`;$('squad').textContent=bots.filter(b=>b.team==='blue').map(b=>b.name+(b.alive?' ●':' ×')).join('   ');$('aim-status').textContent=aim?'AIM ON · Q TO RELEASE':'Q TO AIM · SPACE OR CLICK TO FIRE';$('health').textContent=Math.ceil(health);$('healthbar').style.width=`${health}%`;$('healthbar').style.background=health<30?'#d67562':'#d3e6a0';$('ammo').textContent=ammo[weaponIndex];$('reserve').textContent=reserve[weaponIndex];$('gunname').textContent=w.name;$('firemode').textContent=reloadTimer>0?'RELOADING':w.auto?'FULL AUTO':w.pellets?'PUMP ACTION':'SEMI AUTO';$('time').textContent=`${Math.floor(elapsed/60).toString().padStart(2,'0')}:${Math.floor(elapsed%60).toString().padStart(2,'0')}`}
function tracer(from,to,color='#e2d4a0'){const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([from,to]),new THREE.LineBasicMaterial({color,transparent:true,opacity:.6}));scene.add(line);effects.push({mesh:line,life:.055,max:.055})}
function impact(point,color='#b7ae8f'){const p=new THREE.Mesh(new THREE.IcosahedronGeometry(.07,0),new THREE.MeshBasicMaterial({color,transparent:true}));p.position.copy(point);scene.add(p);effects.push({mesh:p,life:.2,max:.2})}
function fire(){if(state!=='playing'||health<=0||elapsed<3)return;const w=weapons[weaponIndex];if(cooldown>0||reloadTimer>0||(!w.auto&&shotLatch))return;if(ammo[weaponIndex]<=0){reload();return}shotLatch=true;ammo[weaponIndex]--;totalShots++;cooldown=w.rate;recoil+=w.recoil;pitch=Math.min(1.35,pitch+w.recoil*(aim?.38:.65));yaw+=(Math.random()-.5)*w.recoil*.22;shotBloom=Math.min(1,shotBloom+.14);sound('shot');flash.visible=true;flash.rotation.z=Math.random()*6;muzzleLight.intensity=3;const moving=joystick.x||joystick.y||['KeyW','KeyA','KeyS','KeyD'].some(k=>keys.has(k));let spread=w.spread*(aim?.22:1)*(moving?1.65:1)*(crouched?.7:1)*(!grounded||slideTimer>0?1.7:1)*(1+shotBloom*1.5);let hitOpponent=false;for(let pellet=0;pellet<(w.pellets||1);pellet++){camera.getWorldDirection(v);v.x+=(Math.random()-.5)*spread;v.y+=(Math.random()-.5)*spread;v.z+=(Math.random()-.5)*spread;ray.set(camera.position,v.normalize());ray.far=100;const targets=walls.concat(bots.filter(b=>b.alive).map(b=>b.group));const hits=ray.intersectObjects(targets,true);let end=camera.position.clone().addScaledVector(v,90);if(hits.length){const h=hits[0];end=h.point;const b=h.object.userData.bot;if(b?.alive&&b.team==='blue'){message('FRIENDLY · HOLD FIRE',.8)}else if(b?.alive){hitOpponent=true;const headshot=!!h.object.userData.head;const rangeFactor=THREE.MathUtils.clamp(1-Math.max(0,h.distance-(w.pellets?5:18))*(w.falloff||.008),w.minRange||.7,1);const damage=w.damage*(headshot?2.5:1)*rangeFactor;b.health-=damage;b.alert=15;hitTime=.14;$('hitmarker').style.color=headshot?'#d3e6a0':'#fff';sound('hit');if(b.health<=0){kills++;message(headshot?'HEADSHOT +100':'OPPONENT ELIMINATED +100',1.4);eliminate(b,'YOU')}impact(h.point,'#c2cda3')}else impact(h.point);if(!b){const mark=new THREE.Mesh(new THREE.CircleGeometry(.035,8),new THREE.MeshBasicMaterial({color:'#30352e',transparent:true,opacity:.7,depthWrite:false}));mark.position.copy(h.point);if(h.face){const normal=h.face.normal.clone().transformDirection(h.object.matrixWorld);mark.position.addScaledVector(normal,.012);mark.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),normal)}scene.add(mark);effects.push({mesh:mark,life:6,max:6})}}const start=new THREE.Vector3();flash.getWorldPosition(start);tracer(start,end);}if(hitOpponent)totalHits++;updateHUD()}
function reload(){const w=weapons[weaponIndex];if(state!=='playing'||health<=0||reloadTimer>0||ammo[weaponIndex]===w.mag)return;if(!reserve[weaponIndex]){message('NO RESERVE AMMO · SWITCH WEAPON',2);return}reloadTimer=w.reload;trigger=false;message('RELOADING',w.reload);sound('reload');updateHUD()}
function start(){audio();state='playing';health=100;kills=0;elapsed=0;lastDamage=-100;ammo=weapons.map(w=>w.mag);reserve=weapons.map(w=>w.mag*6);reloadTimer=0;cooldown=.4;recoil=0;totalHits=0;totalShots=0;player.set(0,1.7,28);yaw=0;pitch=0;keys.clear();arrowPressTime.clear();arrowReleaseTime.clear();trigger=false;shotLatch=false;aim=false;crouched=false;touchSprint=false;shotBloom=0;damageFade=0;resetTouch();resetMovement();resetBots();$('crosshair').hidden=false;document.body.classList.remove('spectating');$('menu').hidden=true;$('hud').hidden=false;$('overlay').hidden=true;$('killfeed').innerHTML='';document.body.classList.add('playing');gun.visible=true;message('5v5 · MOVE OUT WITH YOUR SQUAD',4);updateHUD();lock()}
function lock(){canvas.focus?.({preventScroll:true});if(!touch){const p=canvas.requestPointerLock?.();p?.catch(()=>{if(state==='playing')message('MOVE POINTER TO LOOK · Q AIM · SPACE FIRE',5)})}}
function pause(){if(state!=='playing')return;state='paused';trigger=false;aim=false;keys.clear();arrowPressTime.clear();arrowReleaseTime.clear();resetTouch();updateHUD();document.exitPointerLock?.();$('overlay').hidden=false;$('overlay-title').textContent='MISSION PAUSED';$('overlay-copy').textContent='Take a breath. '+maps[mapIndex].name+' can wait.';$('summary').innerHTML='';$('resume').hidden=false}
function resume(){state='playing';$('overlay').hidden=true;lock()}
function finish(won){state=won?'won':'lost';trigger=false;aim=false;keys.clear();arrowPressTime.clear();arrowReleaseTime.clear();resetTouch();document.exitPointerLock?.();$('overlay').hidden=false;$('overlay-title').textContent=won?'BLUE TEAM WINS':'RED TEAM WINS';$('overlay-copy').textContent=won?'Your squad cleared '+maps[mapIndex].name+'. Ready for another round?':'Your squad was eliminated. Regroup and try another approach.';$('resume').hidden=true;$('summary').innerHTML=`<div>${kills}<small>YOUR ELIMINATIONS</small></div><div>${Math.floor(elapsed/60)}:${String(Math.floor(elapsed%60)).padStart(2,'0')}<small>ROUND TIME</small></div><div>${totalShots?Math.round(totalHits/totalShots*100):0}%<small>ACCURACY</small></div>`}
function back(){state='menu';$('loadout').scrollTop=0;$('menu').scrollTop=0;$('menu').hidden=false;$('hud').hidden=true;$('overlay').hidden=true;document.body.classList.remove('playing','aiming');document.exitPointerLock?.();trigger=false;aim=false;keys.clear();arrowPressTime.clear();arrowReleaseTime.clear();gun.visible=false;for(const b of bots)scene.remove(b.group);bots.length=0}
// Both squads use the same visibility, cover and opponent-selection rules.
function botAI(dt){
 const difficulty=$('difficulty').value;
 const enemyScale=difficulty==='recruit'?.68:difficulty==='veteran'?1.18:.98;
 const playerTarget={isPlayer:true,team:'blue',name:'YOU',position:player};
 for(const b of bots){
  if(!b.alive){if(b.death<1){b.death+=dt*2;b.group.rotation.z=Math.min(1.5,b.death*1.5);b.group.position.y=-Math.min(.55,b.death*.55)}continue}
  const p=b.group.position,eye=new THREE.Vector3(p.x,1.5,p.z);
  const opponents=bots.filter(o=>o.alive&&o.team!==b.team).map(o=>({bot:o,position:o.group.position}));
  if(b.team==='red'&&health>0)opponents.push(playerTarget);
  const visible=opponents.filter(o=>p.distanceTo(o.position)<26&&clearSight(eye,new THREE.Vector3(o.position.x,o.isPlayer?player.y-.15:1.45,o.position.z))).sort((a,c)=>p.distanceToSquared(a.position)-p.distanceToSquared(c.position));
  const current=visible.find(o=>o.isPlayer?b.target==='player':o.bot===b.target);
  const target=current||visible[0];
  b.marker.visible=b.team==='blue'||(health>0&&p.distanceTo(player)<24&&clearSight(player,eye));
  if(elapsed<6){b.target=null;continue}
  if(target){b.target=target.isPlayer?'player':target.bot;b.lastSeen=target.position.clone();b.alert=5}else{b.target=null;b.alert=Math.max(0,b.alert-dt)}
  b.pathTimer-=dt;b.fireTimer-=dt;
  const dist=target?p.distanceTo(target.position):Infinity;
  if(b.pathTimer<=0){
   b.pathTimer=.8+random()*.5;
   // Separate approach lanes keep the squads spread across the yard.
   let destination=new THREE.Vector3((b.index-2)*6,0,b.team==='blue'?1:-6);
   if(b.alert>0&&b.lastSeen)destination=b.lastSeen;
   else if(elapsed>32&&opponents.length)destination=opponents.sort((a,c)=>p.distanceToSquared(a.position)-p.distanceToSquared(c.position))[0].position;
   b.path=pathTo(p,destination);
  }
  let moved=false;
  if((!target||dist>18)&&b.path.length){
   const next=b.path[0],dx=next.x-p.x,dz=next.z-p.z,len=Math.hypot(dx,dz);
   if(len<.3)b.path.shift();else{const speed=(b.team==='blue'?2.3:1.9)*dt;move(p,dx/len*speed,dz/len*speed,.42);b.group.rotation.y=Math.atan2(-dx,-dz);moved=true}
  }else if(target&&dist<8){const dx=p.x-target.position.x,dz=p.z-target.position.z;move(p,dx/Math.max(dist,.1)*dt,dz/Math.max(dist,.1)*dt,.42)}
  if(target&&dist>=8&&dist<20&&b.team==='red'&&difficulty!=='recruit'){const side=Math.sin(elapsed*.8+b.index*2)>0?1:-1,dx=target.position.x-p.x,dz=target.position.z-p.z;move(p,-dz/dist*side*dt*.75,dx/dist*side*dt*.75,.42)}
  if(target){
   b.group.rotation.y=Math.atan2(target.position.x-p.x,target.position.z-p.z)+Math.PI;
   if(b.fireTimer<=0){
    const scale=b.team==='blue'?1:enemyScale;b.fireTimer=(.95+random()*.7)/scale;
    const start=eye.clone().add(new THREE.Vector3(-Math.sin(b.group.rotation.y)*.6,-.15,-Math.cos(b.group.rotation.y)*.6));
    tracer(start,new THREE.Vector3(target.position.x,target.isPlayer?player.y-.25:1.3,target.position.z),b.team==='blue'?'#92dfff':'#eed0a3');sound('enemy');
    const chance=Math.max(.24,.76-dist*.013)*scale*(target.isPlayer&&(keys.has('ShiftLeft')||touchSprint)?.7:1)*(target.isPlayer&&crouched?.75:1);
    if(random()<chance){
     if(target.isPlayer){
      health=Math.max(0,health-((difficulty==='recruit'?4:6)+random()*3)*scale);damageFade=.55;lastDamage=elapsed;sound('hurt');
      if(health<=0){trigger=false;aim=false;keys.clear();arrowPressTime.clear();arrowReleaseTime.clear();$('crosshair').hidden=true;resetTouch();document.body.classList.add('spectating');checkRound();if(state==='playing')message('OPERATOR DOWN · WATCHING YOUR SQUAD',5)}
     }else{target.bot.health-=14+random()*9;if(target.bot.health<=0)eliminate(target.bot,b.name)}
     if(state!=='playing')return;
    }
   }
  }
  // Gentle separation prevents squad members stacking in a doorway.
  for(const other of bots){if(other===b||!other.alive)continue;const dx=p.x-other.group.position.x,dz=p.z-other.group.position.z,d=Math.hypot(dx,dz);if(d>.01&&d<1.15)move(p,dx/d*dt*.6,dz/d*dt*.6,.42)}
  if(moved){b.walk+=dt*8;b.limbs[0].rotation.x=Math.sin(b.walk)*.5;b.limbs[1].rotation.x=-Math.sin(b.walk)*.5}else b.limbs.forEach(l=>l.rotation.x*=.8);
 }
}
function toggleAim(){if(state!=='playing'||health<=0||slideTimer>0)return;aim=!aim;if(aim)touchSprint=false;updateHUD()}
function toggleCrouch(){if(state!=='playing'||health<=0||slideTimer>0||!grounded)return;if(sprintHeld()&&forwardInput()>.25&&!crouched){startSlide();return}crouched=!crouched;if(crouched)touchSprint=false;updateHUD()}

$('deploy').onclick=start;$('pause').onclick=pause;$('resume').onclick=resume;$('restart').onclick=start;$('back').onclick=back;
document.querySelectorAll('[data-weapon]').forEach(el=>el.onclick=()=>setWeapon(Number(el.dataset.weapon),false));
$('sound').onclick=()=>{muted=!muted;$('sound').textContent=muted?'SOUND OFF':'SOUND ON';if(!muted)audio()};
function keyCode(e){if(e.code&&e.code!=='Unidentified')return e.code;const k=e.key||'';return {Up:'ArrowUp',Down:'ArrowDown',Left:'ArrowLeft',Right:'ArrowRight',' ':'Space',Esc:'Escape',Shift:'ShiftLeft'}[k]||(/^[a-z]$/i.test(k)?'Key'+k.toUpperCase():/^[1-6]$/.test(k)?'Digit'+k:k)}
addEventListener('keydown',e=>{const code=keyCode(e);
 if(state==='playing'){
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(code))e.preventDefault();
  if(health>0){if(code.startsWith('Arrow')){if(!keys.has(code))arrowPressTime.set(code,elapsed);arrowReleaseTime.delete(code)}keys.add(code);if(code==='KeyQ'&&!e.repeat)toggleAim();if(code==='KeyC'&&!e.repeat)toggleCrouch();if(code==='KeyE'&&!e.repeat)jump();if(code==='Space'&&!e.repeat){shotLatch=false;fire()}if(code==='KeyR'&&!e.repeat)reload();if(/^Digit[1-6]$/.test(code)&&!e.repeat)setWeapon(Number(code.slice(-1))-1)}
  if(code==='Escape')pause();
 }else if(state==='paused'&&code==='Escape')resume();
});
addEventListener('keyup',e=>{const code=keyCode(e);const pressed=arrowPressTime.get(code);if(state==='playing'&&pressed!==undefined&&elapsed-pressed<.09)arrowReleaseTime.set(code,pressed+.09);else keys.delete(code);if(code==='Space')shotLatch=false});
let drag=false,lastMouse={x:0,y:0};
canvas.addEventListener('mousedown',e=>{if(state!=='playing'||health<=0)return;canvas.focus?.({preventScroll:true});audio();if(e.button===2||(e.button===0&&e.ctrlKey)){e.preventDefault();toggleAim();return}if(e.button===0){trigger=true;shotLatch=false;fire()}});
addEventListener('mouseup',e=>{if(e.button===0){trigger=false;shotLatch=false}});
addEventListener('mousemove',e=>{if(state!=='playing'||health<=0)return;if(document.pointerLockElement===canvas||e.target===canvas){yaw-=e.movementX*(aim?.0011:.0021);pitch=THREE.MathUtils.clamp(pitch-e.movementY*(aim?.0011:.0021),-1.4,1.4)}});
canvas.addEventListener('contextmenu',e=>e.preventDefault());document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement&&state==='playing'&&!touch)pause()});addEventListener('blur',()=>{if(state==='playing')pause()});document.addEventListener('visibilitychange',()=>{if(document.hidden&&state==='playing')pause()});
// Each touch surface owns its pointer; movement, looking and firing can overlap.
let joystick={x:0,y:0},lookPointer=null,stickPointer=null,firePointer=null;
const stick=$('stick'),look=$('look-zone'),fireButton=$('touch-fire');
function canControl(){return state==='playing'&&health>0}
function resetTouch(){joystick={x:0,y:0};lookPointer=null;stickPointer=null;firePointer=null;touchSprint=false;trigger=false;shotLatch=false;stick.firstElementChild.style.transform=''}
function updateStick(e){const r=stick.getBoundingClientRect(),dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2,radius=r.width*.34,len=Math.max(radius,Math.hypot(dx,dy));joystick={x:dx/len,y:dy/len};stick.firstElementChild.style.transform=`translate(${joystick.x*radius}px,${joystick.y*radius}px)`}
stick.onpointerdown=e=>{if(!canControl()||stickPointer!==null)return;e.preventDefault();stickPointer=e.pointerId;stick.setPointerCapture(e.pointerId);updateStick(e)};
stick.onpointermove=e=>{if(e.pointerId===stickPointer)updateStick(e)};
function releaseStick(e){if(e.pointerId!==stickPointer)return;stickPointer=null;joystick={x:0,y:0};stick.firstElementChild.style.transform=''}
stick.onpointerup=stick.onpointercancel=stick.onlostpointercapture=releaseStick;
function lookMove(e,p){const sensitivity=Number($('sensitivity').value)*.003*(aim?.55:1);yaw-=(e.clientX-p.x)*sensitivity;pitch=THREE.MathUtils.clamp(pitch-(e.clientY-p.y)*sensitivity,-1.4,1.4);p.x=e.clientX;p.y=e.clientY}
look.onpointerdown=e=>{if(!canControl()||lookPointer)return;e.preventDefault();look.setPointerCapture(e.pointerId);lookPointer={id:e.pointerId,x:e.clientX,y:e.clientY}};
look.onpointermove=e=>{if(lookPointer?.id===e.pointerId)lookMove(e,lookPointer)};
function releaseLook(e){if(lookPointer?.id===e.pointerId)lookPointer=null}look.onpointerup=look.onpointercancel=look.onlostpointercapture=releaseLook;
fireButton.onpointerdown=e=>{if(!canControl()||firePointer)return;e.preventDefault();audio();fireButton.setPointerCapture(e.pointerId);firePointer={id:e.pointerId,x:e.clientX,y:e.clientY};trigger=true;shotLatch=false;touchSprint=false;fire()};
fireButton.onpointermove=e=>{if(firePointer?.id===e.pointerId)lookMove(e,firePointer)};
function releaseFire(e){if(firePointer?.id!==e.pointerId)return;firePointer=null;trigger=false;shotLatch=false}fireButton.onpointerup=fireButton.onpointercancel=fireButton.onlostpointercapture=releaseFire;
$('touch-aim').onclick=toggleAim;$('touch-reload').onclick=reload;$('touch-crouch').onclick=toggleCrouch;$('touch-jump').onclick=jump;$('touch-slide').onclick=startSlide;
$('touch-swap').onclick=()=>{if(canControl())setWeapon((weaponIndex+1)%weapons.length)};
$('touch-sprint').onclick=()=>{if(!canControl()||slideTimer>0)return;touchSprint=!touchSprint;if(touchSprint){aim=false;crouched=false}updateHUD()};
$('control-mode').onchange=()=>setTouchMode($('control-mode').value==='touch');
setTouchMode(touch);
function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}addEventListener('resize',resize);resize();
maps.forEach((m,i)=>$('map-'+i).onclick=()=>selectMap(i));$('map-select').onchange=()=>selectMap(Number($('map-select').value));selectMap(0);setWeapon(0,false);gun.visible=false;
let last=performance.now();
function frame(now){requestAnimationFrame(frame);const dt=Math.min((now-last)/1000,.05);last=now;
if(state==='menu'){const t=now*.00007;camera.position.set(5+Math.sin(t)*2.5,4.4,27);camera.lookAt(-4,2,-10);gun.visible=false}else if(state==='playing'){
 elapsed+=dt;for(const [code,time] of arrowReleaseTime){if(elapsed>=time){keys.delete(code);arrowReleaseTime.delete(code);arrowPressTime.delete(code)}}cooldown=Math.max(0,cooldown-dt);recoil=THREE.MathUtils.damp(recoil,0,12,dt);shotBloom=Math.max(0,shotBloom-dt*.8);slideCooldown=Math.max(0,slideCooldown-dt);slideTimer=Math.max(0,slideTimer-dt);let forward=Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown'))-joystick.y;let right=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'))+joystick.x;const len=Math.max(1,Math.hypot(forward,right));forward/=len;right/=len;const moving=Math.abs(forward)+Math.abs(right)>.05;const sprint=sprintHeld()&&!aim&&!crouched&&slideTimer<=0&&forward>0;const speed=(health>0?(sprint?6.8:crouched?1.8:aim?2.3:4.1):0)*dt;if(slideTimer>0&&health>0){const distance=(4+4.5*slideTimer/.75)*dt;const oldX=player.x,oldZ=player.z;move(player,-Math.sin(slideYaw)*distance,-Math.cos(slideYaw)*distance,.38,feetY);if(Math.hypot(player.x-oldX,player.z-oldZ)<distance*.15)slideTimer=0}else move(player,(-Math.sin(yaw)*forward+Math.cos(yaw)*right)*speed,(-Math.cos(yaw)*forward-Math.sin(yaw)*right)*speed,.38,feetY);updateVertical(dt);if(slideTimer>0&&!grounded)slideTimer=0;if(moving&&grounded&&slideTimer<=0){footTime+=dt*(sprint?1.6:1);if(footTime>.43){sound('step');footTime=0}}const bob=moving&&grounded&&slideTimer<=0?Math.sin(elapsed*(sprint?14:10))*.035:Math.sin(elapsed*1.4)*.004;camera.position.copy(player);camera.position.y+=bob;camera.rotation.set(pitch+recoil*.4,yaw,slideTimer>0?-.035:0,'YXZ');camera.fov=THREE.MathUtils.damp(camera.fov,aim?(weaponIndex===2?36:52):sprint||slideTimer>0?80:73,10,dt);camera.updateProjectionMatrix();gun.visible=true;const targetX=aim?0:.26,targetY=aim?-.157:-.24;gun.position.x=THREE.MathUtils.damp(gun.position.x,targetX,14,dt);gun.position.y=targetY+Math.abs(bob)*.5;gun.position.z=-.7+recoil*.65;gun.rotation.set(recoil,0,moving?Math.sin(elapsed*6)*.012:0);if(reloadTimer>0){reloadTimer-=dt;const progress=1-reloadTimer/weapons[weaponIndex].reload,lift=Math.sin(Math.PI*progress);gun.rotation.x=-.6*lift;gun.rotation.z=-.38*lift;gun.position.y-=.12*lift;gun.position.x+=.08*lift;if(reloadTimer<=0){const amount=Math.min(weapons[weaponIndex].mag-ammo[weaponIndex],reserve[weaponIndex]);ammo[weaponIndex]+=amount;reserve[weaponIndex]-=amount;reloadTimer=0;sound('reload');message('READY',.6)}}if(trigger||keys.has('Space'))fire();if(health>0&&health<100&&elapsed-lastDamage>8)health=Math.min(100,health+dt*5);if(state==='playing')botAI(dt);if(health<=0){const ally=bots.find(b=>b.team==='blue'&&b.alive);gun.visible=false;if(ally){const dir=new THREE.Vector3(0,0,1).applyAxisAngle(up,ally.group.rotation.y);camera.position.copy(ally.group.position).addScaledVector(dir,2.5);camera.position.y=3;camera.lookAt(ally.group.position.clone().add(new THREE.Vector3(0,1.5,0)).addScaledVector(dir,-8));$('notification').textContent='SPECTATING '+ally.name;noticeTime=1}}updateHUD();const deg=(((-yaw*180/Math.PI)%360)+360)%360;$('bearing').textContent=['N','NE','E','SE','S','SW','W','NW'][Math.round(deg/45)%8]+' '+Math.round(deg)+'°';document.body.classList.toggle('aiming',aim);if(elapsed<6&&state==='playing')message('SQUADS READY · '+Math.ceil(6-elapsed),.2);noticeTime-=dt;if(noticeTime<=0)$('notification').textContent='';hitTime-=dt;$('hitmarker').style.opacity=hitTime>0?1:0;
}
damageFade=Math.max(0,damageFade-dt*.8);$('damage').style.opacity=damageFade;flash.visible=state==='playing'&&cooldown>weapons[weaponIndex].rate-.045;muzzleLight.intensity=flash.visible?3:0;
for(let i=effects.length-1;i>=0;i--){const e=effects[i];e.life-=dt;e.mesh.material.opacity=Math.max(0,e.life/e.max);if(e.life<=0){scene.remove(e.mesh);e.mesh.geometry.dispose();e.mesh.material.dispose();effects.splice(i,1)}}renderer.render(scene,camera)}
requestAnimationFrame(frame);$('loading').hidden=true;
// Optional browser agent hooks expose only normal menu actions and game status.
const modelContext=document.modelContext;
if(modelContext?.registerTool){
  const tools=[{
    name:'choose_loadout',description:'Choose a map, weapon and opponent difficulty before a single-player mission.',
    inputSchema:{type:'object',properties:{map:{type:'string',enum:maps.map(m=>m.name)},weapon:{type:'string',enum:weapons.map(w=>w.name)},difficulty:{type:'string',enum:['recruit','regular','veteran']}},required:['weapon'],additionalProperties:false},
    annotations:{readOnlyHint:false,untrustedContentHint:false},
    execute:async(input)=>{
      const index=weapons.findIndex(w=>w.name===input?.weapon);
      if(input.map&&!maps.some(m=>m.name===input.map))throw new Error('Invalid map');
      if(index<0||input.difficulty&&!['recruit','regular','veteran'].includes(input.difficulty))throw new Error('Invalid loadout');
      if(state!=='menu')throw new Error('Return to the loadout screen first.');
      if(input.map)selectMap(maps.findIndex(m=>m.name===input.map));setWeapon(index,false);if(input.difficulty)$('difficulty').value=input.difficulty;
      return {map:maps[mapIndex].name,weapon:weapons[weaponIndex].name,difficulty:$('difficulty').value};
    }
  },{
    name:'read_mission_status',description:'Read the current Iron Sector mission status.',
    inputSchema:{type:'object',properties:{},additionalProperties:false},
    annotations:{readOnlyHint:true,untrustedContentHint:false},
    execute:async()=>({state,map:maps[mapIndex].name,weapon:weapons[weaponIndex].name,health:Math.ceil(health),position:{x:Math.round(player.x*100)/100,z:Math.round(player.z*100)/100},eliminations:kills,opponentsRemaining:teamAlive('red'),blueAlive:teamAlive('blue'),aiming:aim,crouched,jumping:!grounded,sliding:slideTimer>0,controls:touch?'touch':'desktop',difficulty:$('difficulty').value,ammo:ammo[weaponIndex],teams:{blue:bots.filter(b=>b.team==='blue').map(b=>({name:b.name,alive:b.alive})),red:bots.filter(b=>b.team==='red').map(b=>({name:b.name,alive:b.alive}))}})
  }];
  for(const tool of tools){try{Promise.resolve(modelContext.registerTool(tool)).catch(()=>{});}catch{}}
}
