// Exercise the 3D code paths under jsdom with a THREE stub.
let JSDOM;
try {
  ({ JSDOM } = require('jsdom'));
} catch (e) {
  console.log('three.smoke: skipped (jsdom not installed)');
  process.exit(0);
}
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '../frontend/public/index.html'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, '../frontend/public/dashboard.js'), 'utf8');

const counts = { mesh: 0, line: 0, render: 0 };

class Col { constructor(){ this.r=1; this.g=1; this.b=1; } clone(){ return new Col(); } lerp(){ return this; } }
class Geo {
  constructor(){ this.attributes = { position: { array: new Float32Array(6000*3), needsUpdate: false } }; }
  setFromPoints(){ return this; }
  setAttribute(k,v){ this.attributes[k]=v; return this; }
  translate(){ return this; }
  dispose(){}
}
class Obj {
  constructor(g,m){ this.geometry=g; this.material=m||{}; this.position={x:0,y:0,z:0,set(){},copy(){}}; this.rotation={x:0,y:0,z:0}; this.children=[]; }
  add(o){ this.children.push(o); } computeLineDistances(){} dispose(){}
}
class Grp { constructor(){ this.children=[]; this.rotation={x:0,y:0,z:0}; this.position={x:0,y:0,z:0,set(){}}; } add(o){ this.children.push(o); } }

const THREE = new Proxy({}, { get: (t, p) => {
  if (p === 'Color') return Col;
  if (p === 'BufferGeometry') return Geo;
  if (['BoxGeometry', 'SphereGeometry', 'TorusGeometry'].includes(p)) return class extends Geo {};
  if (p === 'Float32BufferAttribute' || p === 'BufferAttribute') return class { constructor(a){ this.array=a; this.needsUpdate=false; } };
  if (p === 'Mesh' || p === 'Points') return class extends Obj { constructor(g,m){ super(g,m); counts.mesh++; } };
  if (p === 'Line' || p === 'LineSegments') return class extends Obj { constructor(g,m){ super(g,m); counts.line++; } };
  if (p === 'Group' || p === 'Scene') return Grp;
  if (p === 'PerspectiveCamera') return class { constructor(){ this.position={set(){}}; } lookAt(){} updateProjectionMatrix(){} };
  if (p === 'WebGLRenderer') return class { setPixelRatio(){} setSize(){} render(){ counts.render++; } };
  return class { constructor(){ this.position={x:0,y:0,z:0,set(){}}; } dispose(){} };
}});

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
const w = dom.window;
w.THREE = THREE;
w.devicePixelRatio = 1;
w.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: false }) });
w.localStorage = { getItem: () => null, setItem(){}, removeItem(){} };
w.requestAnimationFrame = () => {};

const fails = [];
w.console.warn = (...a) => fails.push(a.join(' '));
w.addEventListener('error', e => fails.push('window.error: ' + (e.error && e.error.stack || e.message)));

try { w.eval(js); } catch (e) { console.error('eval failed:', e); process.exit(1); }
w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));

console.log('scenes created:', Object.keys(w.scenes).join(',') || '(none)');
if (fails.length) console.log('warnings:', fails.join(' | '));

// Drive each scene's data path.
try {
  w.scenes.price.state.raw = { history: [1.1,1.11,1.12,1.13,1.14,1.15], forecast: [1.151,1.152] };
  w.scenes.price.state.needsRebuild = true; w.scenes.price.update();
} catch (e) { console.log('price drive error:', e.message); }
try {
  w.scenes.corr.state.data = { pairs: ['A','B','C'], matrix: [[1,0.5,-0.2],[0.5,1,0.3],[-0.2,0.3,1]] };
  w.scenes.corr.state.needsRebuild = true; w.scenes.corr.update();
} catch (e) { console.log('corr drive error:', e.message); }
try {
  w.update3DGauges({ rsi: 60, adx: 30, stochastic: 40 });
  w.scenes.gauge.update();
} catch (e) { console.log('gauge drive error:', e.message); }
try { w.scenes.hero.update(); } catch (e) { console.log('hero drive error:', e.message); }

console.log('meshes:', counts.mesh, 'lines:', counts.line, 'renders:', counts.render);
const ok = counts.mesh > 0 && counts.line > 0 && counts.render >= 4;
console.log(ok ? '3D PIPELINE OK' : '3D PIPELINE INCOMPLETE');
process.exit(ok ? 0 : 1);
