import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile('app-updater-0.19.0.js','utf8');
const assert=(condition,message)=>{if(!condition)throw new Error(message);};

function storage(values={}){
  const data=new Map(Object.entries(values));
  return {
    get length(){return data.size;},
    key(index){return [...data.keys()][index]??null;},
    getItem(key){return data.has(key)?data.get(key):null;},
    setItem(key,value){data.set(key,String(value));},
    removeItem(key){data.delete(key);},
    snapshot(){return Object.fromEntries(data);}
  };
}

async function runScenario({controlled,waiting,alreadyReset=false}){
  const loaded=[];
  const messages=[];
  const deletedDatabases=[];
  let reloads=0;
  let controllerChange=null;
  const app={innerHTML:''};
  const localStorage=storage({
    'fenologia-session':'sesión anterior',
    'admin-config-v1':'usuarios anteriores',
    'otro-proyecto':'conservar',
    'fenologia-records':'evaluaciones protegidas',
    ...(alreadyReset?{'fenologia-access-start-v2':'done'}:{})
  });
  const sessionStorage=storage({'fenologia-login-attempts-v2':'anterior','otro-temporal':'conservar'});
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
  const window={
    setTimeout(callback){callback();return 1;},
    indexedDB:{deleteDatabase(name){
      deletedDatabases.push(name);
      const request={};
      queueMicrotask(()=>request.onsuccess?.());
      return request;
    }}
  };
  const context={window,document,location,localStorage,sessionStorage,navigator:{serviceWorker},console};
  vm.createContext(context);
  vm.runInContext(source,context,{filename:'app-updater-0.19.0.js'});
  await new Promise(resolve=>setImmediate(resolve));
  await new Promise(resolve=>setImmediate(resolve));
  return {loaded,messages,reloads,html:app.innerHTML,deletedDatabases,local:localStorage.snapshot(),session:sessionStorage.snapshot()};
}

const legacy=await runScenario({controlled:true,waiting:true});
assert(legacy.messages.some(message=>message?.type==='SKIP_WAITING'),'El puente no activó el worker pendiente.');
assert(legacy.reloads===1,'El puente no recargó después de cambiar el worker.');
assert(legacy.loaded.length===0,'El puente cargó módulos antes de reemplazar la caché anterior.');

const fresh=await runScenario({controlled:false,waiting:false});
assert(fresh.loaded.join('|')==='app-db.js?v=0.19.0-login-2|app-bootstrap.js?v=0.19.0-login-2','El inicio limpio no cargó DB y bootstrap con la identidad de caché nueva.');
assert(fresh.reloads===0,'El inicio limpio provocó una recarga innecesaria.');
assert(fresh.deletedDatabases.length===0,'El reinicio de accesos eliminó la base IndexedDB y pudo borrar evaluaciones.');
assert(!('fenologia-session' in fresh.local)&&!('admin-config-v1' in fresh.local),'El reinicio conservó usuarios o sesiones anteriores.');
assert(!('fenologia-login-attempts-v2' in fresh.session),'El reinicio conservó intentos de acceso anteriores.');
assert(fresh.local['otro-proyecto']==='conservar'&&fresh.session['otro-temporal']==='conservar','El reinicio borró datos ajenos a Fenología.');
assert(fresh.local['fenologia-records']==='evaluaciones protegidas','El reinicio borró evaluaciones locales.');
assert(fresh.local['fenologia-access-start-v2']==='done','El reinicio no dejó su marcador de ejecución única.');

const completed=await runScenario({controlled:false,waiting:false,alreadyReset:true});
assert(completed.deletedDatabases.length===0,'El reinicio volvió a borrar datos después de completarse.');
assert(completed.local['fenologia-session']==='sesión anterior','El marcador no evitó una segunda limpieza destructiva.');

console.log('Puente validado: actualización, reinicio único de Fenología y conservación de datos ajenos.');
