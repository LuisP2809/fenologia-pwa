import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const values=new Map();
globalThis.window=globalThis;
globalThis.localStorage={
  getItem:key=>values.has(key)?values.get(key):null,
  setItem:(key,value)=>values.set(key,String(value)),
  removeItem:key=>values.delete(key)
};

for(const file of ['app-credentials.js','app-package-security.js']){
  vm.runInThisContext(await readFile(file,'utf8'),{filename:file});
}

const credential=await FenologiaCredentials.create('12345678');
if(!await FenologiaCredentials.verify('12345678',credential))throw new Error('PBKDF2 no validó la credencial correcta.');
if(await FenologiaCredentials.verify('87654321',credential))throw new Error('PBKDF2 aceptó una credencial incorrecta.');
const legacy={pinHash:await FenologiaCredentials.legacyHash('12345678')};
if(!await FenologiaCredentials.verify('12345678',legacy))throw new Error('La migración de credenciales antiguas no es compatible.');

const signed=await FenologiaPackageSecurity.sign({type:'test-package',version:2,value:17});
const pending=await FenologiaPackageSecurity.verify(signed);
if(!pending.pendingTrust)throw new Error('La primera firma se confió sin confirmación.');
await FenologiaPackageSecurity.trust(signed.signature.publicKey);
const verified=await FenologiaPackageSecurity.verify(signed);
if(verified.pendingTrust||verified.core.value!==17)throw new Error('La firma vinculada no se validó correctamente.');
let rejected=false;
try{await FenologiaPackageSecurity.verify({...signed,value:18});}catch{rejected=true;}
if(!rejected)throw new Error('Una modificación del paquete no invalidó la firma.');

console.log('Criptografía validada: PBKDF2, migración, ECDSA y confianza inicial explícita.');
