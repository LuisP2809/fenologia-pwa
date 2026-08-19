import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile('app-updater.js','utf8');
const assert=(condition,message)=>{if(!condition)throw new Error(message);};

async function runScenario({controlled,waiting}){
  const loaded=[];
  const messages=[];
  let reloads=0;
  let controllerChange=null;
  const app={innerHTML:''};
  const registration={
    waiting:waiting?{postMessage(message){messages.push(message);controllerChange?.();}}:null,
    installing:null,
    async update(){}
  };
  const serviceWorker={
    controller:controlled?{}:null,
    async register(){return registration;},
    addEventListener(type,callback){if(type==='controllerchange')controllerChange=callback;}
  };
  const document={
    body:{appendChild(script){loaded.push(script.src);script.onload?.();}},
    querySelector(selector){return selector==='#app'?app:null;},
    createElement(){return {async:true,onload:null,onerror:null,src:''};}
  };
  const location={protocol:'https:',reload(){reloads+=1;}};
  const window={setTimeout(callback){callback();return 1;}};
  const context={window,document,location,navigator:{serviceWorker},console};
  vm.createContext(context);
  vm.runInContext(source,context,{filename:'app-updater.js'});
  await new Promise(resolve=>setImmediate(resolve));
  await new Promise(resolve=>setImmediate(resolve));
  return {loaded,messages,reloads,html:app.innerHTML};
}

const legacy=await runScenario({controlled:true,waiting:true});
assert(legacy.messages.some(message=>message?.type==='SKIP_WAITING'),'El puente no activó el worker pendiente.');
assert(legacy.reloads===1,'El puente no recargó después de cambiar el worker.');
assert(legacy.loaded.length===0,'El puente cargó módulos antes de reemplazar la caché anterior.');

const fresh=await runScenario({controlled:false,waiting:false});
assert(fresh.loaded.join('|')==='app-db.js?v=0.15.1|app-bootstrap.js?v=0.15.1','El inicio limpio no cargó DB y bootstrap 0.15.1 en orden.');
assert(fresh.reloads===0,'El inicio limpio provocó una recarga innecesaria.');

console.log('Puente de actualización validado: reemplazo de caché anterior e inicio limpio.');
