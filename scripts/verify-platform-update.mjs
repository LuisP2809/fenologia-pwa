import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const inserted=[];
const waitingMessages=[];
let hasVersion=false;
let hasInstallCard=false;
let hasUpdateBanner=false;

const form={insertAdjacentHTML(position,html){inserted.push({position,html});if(html.includes('platform-login-version'))hasVersion=true;}};
const loginCard={
  querySelector(selector){
    if(selector==='#login-form, #first-admin-form')return form;
    if(selector==='.platform-login-version')return hasVersion?{}:null;
    if(selector==='.platform-login-card')return hasInstallCard?{}:null;
    return null;
  },
  insertAdjacentHTML(position,html){
    inserted.push({position,html});
    if(html.includes('platform-login-card'))hasInstallCard=true;
    if(html.includes('platform-update-banner'))hasUpdateBanner=true;
  }
};
const updateNode={classList:{add(){}}};
const document={
  documentElement:{dataset:{}},
  querySelector(selector){
    if(selector==='.login-card')return loginCard;
    if(selector==='#platform-update-banner')return hasUpdateBanner?updateNode:null;
    return null;
  },
  addEventListener(){}
};
const registration={
  waiting:{postMessage(message){waitingMessages.push(message);}},
  async update(){},
  addEventListener(){}
};
const navigator={
  standalone:false,storage:{persist:async()=>true,persisted:async()=>true},
  serviceWorker:{controller:{},register:async()=>registration,addEventListener(){}}
};
const windowObject={
  navigator,matchMedia:()=>({matches:false}),addEventListener(){},
  setTimeout(callback){callback();return 1;}
};
const state={session:null,catalog:{}};
const context={
  window:windowObject,document,navigator,state,location:{protocol:'https:'},console,
  header:()=>'<header></header>',loginView(){},render(){},showToast(){},setTimeout:windowObject.setTimeout,
  clearTimeout(){},File:class File{}
};
vm.createContext(context);
vm.runInContext(await readFile('app-platform.js','utf8'),context,{filename:'app-platform.js'});
await new Promise(resolve=>setImmediate(resolve));
await new Promise(resolve=>setImmediate(resolve));

assert(hasVersion&&inserted.some(item=>item.html.includes('Versión 0.17.0')),'La versión no apareció en la bienvenida.');
assert(hasUpdateBanner,'La actualización pendiente no apareció sin iniciar sesión.');
assert(waitingMessages.some(message=>message?.type==='SKIP_WAITING'),'La actualización pendiente no se activó automáticamente en la bienvenida.');
assert(state.session===null,'La actualización simulada creó o alteró una sesión.');

console.log('Actualización de plataforma validada: versión visible y activación segura antes del ingreso.');
