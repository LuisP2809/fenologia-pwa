import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const requests=[];
const host={innerHTML:''};
const document={
  body:{appendChild(){}},
  querySelector(selector){if(selector==='#admin-modal-host')return host;return null;},
  createElement(){return {id:'',innerHTML:''};},
  addEventListener(){}
};
const context={
  document,location:{href:'https://example.test/fenologia/',origin:'https://example.test',pathname:'/fenologia/'},
  navigator:{onLine:true,clipboard:{writeText:async()=>{}},share:null},
  state:{session:{id:'ADM-001',role:'Administrador'}},app:{innerHTML:''},icons:{leaf:'🌿',check:'✓'},
  esc:value=>String(value??'').replace(/[&<>"']/g,''),showToast(){},render(){},history:{replaceState(){}},
  URL,JSON,Date,Intl,String,Error,Promise,Math,Array,Object,RegExp,
  MutationObserver:class MutationObserver{observe(){}},
  FormData:class FormData{},setTimeout(){return 1;},clearTimeout(){},addEventListener(){},
  fetch:async(endpoint,options)=>{
    const body=JSON.parse(options.body);requests.push({endpoint,body});
    if(body.action==='ping')return {ok:true,json:async()=>({ok:false,errorCode:'USER_DISABLED',message:'Usuario desactivado.'})};
    if(body.action==='bootstrap-admin')return {ok:true,json:async()=>({ok:true,profile:{evaluatorId:'ADM-001',username:'admin',name:'Administrador',role:'Administrador',deviceToken:'a'.repeat(64)}})};
    return {ok:true,json:async()=>({ok:true,user:{id:'EVA-001',username:'eva.001',name:'Eva Uno',role:'Evaluador',active:true},activation:{code:'ABCD-2345',expiresAt:'2026-08-30T12:00:00.000Z',user:{id:'EVA-001',username:'eva.001',name:'Eva Uno',role:'Evaluador'}}})};
  }
};
context.window=context;
context.FenologiaSync={getConfig:()=>({endpoint:'https://script.google.com/macros/s/PRUEBA/exec',deviceToken:'t'.repeat(64)})};
context.FenologiaAdmin={config:()=>({users:[{id:'ADM-001'}]})};
vm.createContext(context);
vm.runInContext(await readFile('vendor/qrcode.js','utf8'),context,{filename:'vendor/qrcode.js'});
vm.runInContext(await readFile('app-user-access-package.js','utf8'),context,{filename:'app-user-access-package.js'});

const created=await context.FenologiaAccess.createUser({name:'Eva Uno',username:'eva.001',role:'Evaluador'});
assert(created.activation.code==='ABCD-2345','La creación central no devolvió el acceso temporal.');
assert(requests.at(-1).body.action==='create-user'&&requests.at(-1).body.evaluatorId==='ADM-001'&&requests.at(-1).body.deviceToken.length===64,'La creación de usuario no está autenticada por el Administrador.');

context.FenologiaAccess.showActivation(created.activation,'Acceso nuevo');
assert(host.innerHTML.includes('<svg')&&host.innerHTML.includes('ABCD-2345')&&host.innerHTML.includes('Solo puede usarse una vez'),'El modal no contiene QR, código y vencimiento de un solo uso.');

const parsed=context.FenologiaAccess.activationParams('https://example.test/fenologia/?activate=ABCD-2345&server=https%3A%2F%2Fscript.google.com%2Fmacros%2Fs%2FPRUEBA%2Fexec');
assert(parsed.code==='ABCD-2345'&&parsed.endpoint.endsWith('/exec'),'El enlace QR no recupera código y servidor.');

await context.FenologiaAccess.bootstrapAdmin({endpoint:'https://script.google.com/macros/s/PRUEBA/exec',setupCode:'WXYZ-6789',name:'Administrador',username:'admin'});
assert(requests.at(-1).body.action==='bootstrap-admin'&&!('deviceToken' in requests.at(-1).body),'El inicio del Administrador envía o exige una credencial previa.');

let disabled=false;
try{await context.FenologiaAccess.verifyCentralUser();}catch(error){disabled=error.code==='USER_DISABLED';}
assert(disabled,'El cliente no distingue una desactivación central.');

console.log('Accesos validados: Administrador único, API autenticada, QR local, enlace y desactivación central.');
