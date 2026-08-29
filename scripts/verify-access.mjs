import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const [userAccessSource,adminSource,adminCss]=await Promise.all([
  readFile('app-user-access-package.js','utf8'),readFile('app-admin-complete.js','utf8'),readFile('css-admin-complete.css','utf8')
]);
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
  URL,JSON,Date,Intl,String,Error,Promise,Math,Array,Object,RegExp,AbortController,
  MutationObserver:class MutationObserver{observe(){}},
  FormData:class FormData{},setTimeout(){return 1;},clearTimeout(){},addEventListener(){},
  fetch:async(endpoint,options)=>{
    const body=JSON.parse(options.body);requests.push({endpoint,body});
    if(body.action==='ping')return {ok:true,json:async()=>({ok:false,errorCode:'USER_DISABLED',message:'Usuario desactivado.'})};
    if(body.action==='bootstrap-admin')return {ok:true,json:async()=>({ok:true,profile:{evaluatorId:'ADM-001',username:'admin',name:'Administrador',role:'Administrador',deviceToken:'a'.repeat(64)}})};
    const user={id:'EVA-001',username:'eva.001',name:'Eva Uno',role:'Evaluador',active:true};
    if(body.action==='list-users')return {ok:true,json:async()=>({ok:true,users:[{id:'ADM-001',username:'admin',name:'Administrador',role:'Administrador',active:true},user]})};
    return {ok:true,json:async()=>({ok:true,user,users:[{id:'ADM-001',username:'admin',name:'Administrador',role:'Administrador',active:true},user],activation:{code:'ABCD-2345',expiresAt:'2026-08-30T12:00:00.000Z',user}})};
  }
};
context.window=context;
context.FenologiaSync={getConfig:()=>({endpoint:'https://script.google.com/macros/s/PRUEBA/exec',deviceToken:'t'.repeat(64)})};
context.FenologiaAdmin={config:()=>({users:[{id:'ADM-001'}]})};
vm.createContext(context);
vm.runInContext(await readFile('vendor/qrcode.js','utf8'),context,{filename:'vendor/qrcode.js'});
vm.runInContext(userAccessSource,context,{filename:'app-user-access-package.js'});

const created=await context.FenologiaAccess.createUser({name:'Eva Uno',username:'eva.001',role:'Evaluador'});
assert(created.activation.code==='ABCD-2345','La creación central no devolvió el acceso temporal.');
assert(requests.at(-1).body.action==='create-user'&&requests.at(-1).body.evaluatorId==='ADM-001'&&requests.at(-1).body.deviceToken.length===64,'La creación de usuario no está autenticada por el Administrador.');

const listed=await context.FenologiaAccess.listUsers();
assert(listed.users.length===2&&requests.at(-1).body.action==='list-users','La pantalla administrativa no puede actualizar su lista central.');

context.FenologiaAccess.showActivation(created.activation,'Acceso nuevo');
assert(host.innerHTML.includes('<svg')&&host.innerHTML.includes('ABCD-2345')&&host.innerHTML.includes('Solo puede usarse una vez'),'El modal no contiene QR, código y vencimiento de un solo uso.');
const panel=context.FenologiaAccess.activationPanel(created.activation,'Acceso nuevo');
assert(panel.includes('central-activation-panel')&&panel.includes('<svg')&&panel.includes('ABCD-2345'),'El acceso nuevo no aparece dentro de la pantalla administrativa.');

const parsed=context.FenologiaAccess.activationParams('https://example.test/fenologia/?activate=ABCD-2345&server=https%3A%2F%2Fscript.google.com%2Fmacros%2Fs%2FPRUEBA%2Fexec');
assert(parsed.code==='ABCD-2345'&&parsed.endpoint.endsWith('/exec'),'El enlace QR no recupera código y servidor.');

await context.FenologiaAccess.bootstrapAdmin({endpoint:'https://script.google.com/macros/s/PRUEBA/exec',setupCode:'WXYZ-6789',name:'Administrador',username:'admin'});
assert(requests.at(-1).body.action==='bootstrap-admin'&&!('deviceToken' in requests.at(-1).body),'El inicio del Administrador envía o exige una credencial previa.');

let disabled=false;
try{await context.FenologiaAccess.verifyCentralUser();}catch(error){disabled=error.code==='USER_DISABLED';}
assert(disabled,'El cliente no distingue una desactivación central.');
assert(adminSource.includes('data-configured-device')&&adminSource.includes('Dispositivo configurado para ${esc(binding.targetName)}'),'El ingreso de un equipo configurado todavía muestra una activación innecesaria.');
assert(userAccessSource.includes("card.querySelector('[data-configured-device]')"),'El módulo de activación vuelve a insertar el botón en un dispositivo configurado.');
assert(adminSource.includes('id="central-user-form"')&&adminSource.includes("form?.addEventListener('submit'"),'La creación de usuarios no usa el formulario directo y aislado de Fitosanidad.');
assert(!adminSource.includes('id="admin-user-form"'),'El modal anterior de usuarios todavía forma parte del flujo activo.');
assert(adminSource.includes('Creando usuario…')&&adminSource.includes("form.dataset.submitting==='true'"),'La creación de usuarios no informa progreso o permite dobles envíos.');
assert(adminSource.includes('data-central-user-feedback')&&adminCss.includes('.central-user-form'),'Los errores de creación no permanecen visibles dentro del formulario.');

console.log('Accesos validados: dispositivo asignado, creación protegida, API autenticada, QR local y desactivación central.');
