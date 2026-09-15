import { chromium } from '@playwright/test';
import fs from 'node:fs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({viewport:{width:1200,height:1000},deviceScaleFactor:1,serviceWorkers:'block'});
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log(m.type(),m.text()); });
page.on('pageerror', e => console.log('PAGE ERROR',e.message));
page.on('response', r => { if(r.status()>=400) console.log('HTTP',r.status(),r.url()); });
await page.goto('http://localhost:5186/?isolated');
await page.waitForFunction(() => window.duo?.ready, {timeout:60000}).catch(()=>{});
await page.waitForTimeout(2500);
fs.mkdirSync('test-results',{recursive:true});
await page.screenshot({path:'test-results/initial.png'});
for(const fold of [0,.6,1]) {
  await page.evaluate(v=>window.duo.setFold(v,true),fold);
  await page.waitForTimeout(500);
  await page.screenshot({path:`test-results/fold-${fold}.png`});
}
await page.evaluate(()=>{window.duo.setFold(0,true); window.duo.camera.position.set(0,0,35);window.duo.camera.lookAt(0,0,0);});
await page.waitForTimeout(500);
await page.screenshot({path:'test-results/back-before.png'});
console.log(await page.evaluate(async()=>{const T=await import('/node_modules/three/build/three.module.js');const ray=new T.Raycaster();return [[0,0],[.13,0],[0,.15],[0,.4]].map(p=>{ray.setFromCamera(new T.Vector2(...p),window.duo.camera);return ray.intersectObjects(window.duo.gltf.scene.children,true).slice(0,8).map(h=>({name:h.object.name,mat:h.object.material.name,distance:h.distance}));});}));
console.log(await page.evaluate(()=>({text:document.querySelector('#load-message').textContent,animation:window.duo?.animation,box:window.duo?.rig && (()=>{let result=[];window.duo.gltf.scene.traverse(o=>{if(o.isMesh&&/screen/i.test(o.name))result.push({name:o.name,material:o.material.name,uv:Array.from(o.geometry.attributes.uv.array.slice(0,12))})});return result})()})));
await browser.close();
