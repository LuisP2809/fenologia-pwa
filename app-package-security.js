(() => {
  const IDENTITY_KEY='package-signing-identity-v1';
  const TRUST_KEY='trusted-package-signer-v1';
  const encoder=new TextEncoder();
  const base64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
  const unbase64=value=>Uint8Array.from(atob(String(value||'')),character=>character.charCodeAt(0));
  const stable=value=>{
    if(Array.isArray(value))return `[${value.map(stable).join(',')}]`;
    if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
  };
  async function setting(key){return window.FenologiaDB?.isReady?.()&&!window.FenologiaDB?.isFallback?.()?window.FenologiaDB.getSetting(key):JSON.parse(localStorage.getItem(`fenologia-${key}`)||'null');}
  async function saveSetting(key,value){localStorage.setItem(`fenologia-${key}`,JSON.stringify(value));if(window.FenologiaDB?.isReady?.()&&!window.FenologiaDB?.isFallback?.())await window.FenologiaDB.setSetting(key,value);}
  async function fingerprint(publicKey){
    const digest=await crypto.subtle.digest('SHA-256',encoder.encode(stable(publicKey)));
    return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('').toUpperCase();
  }
  async function identity(){
    let stored=await setting(IDENTITY_KEY);if(stored?.privateKey&&stored?.publicKey)return stored;
    const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
    stored={privateKey:await crypto.subtle.exportKey('jwk',pair.privateKey),publicKey:await crypto.subtle.exportKey('jwk',pair.publicKey),createdAt:new Date().toISOString()};
    stored.fingerprint=await fingerprint(stored.publicKey);await saveSetting(IDENTITY_KEY,stored);return stored;
  }
  async function sign(core){
    const signer=await identity();
    const key=await crypto.subtle.importKey('jwk',signer.privateKey,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
    const value=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,encoder.encode(stable(core)));
    return {...core,signature:{algorithm:'ECDSA-P256-SHA256',fingerprint:signer.fingerprint,publicKey:signer.publicKey,value:base64(value)}};
  }
  async function trust(publicKey){
    const calculated=await fingerprint(publicKey);
    const trusted=await setting(TRUST_KEY);
    if(trusted?.fingerprint&&trusted.fingerprint!==calculated)throw new Error('Ya existe una identidad administrativa diferente vinculada.');
    if(!trusted)await saveSetting(TRUST_KEY,{fingerprint:calculated,publicKey,trustedAt:new Date().toISOString()});
    return calculated;
  }
  async function verify(payload,{trustOnFirstUse=false}={}){
    if(!payload?.signature||payload.signature.algorithm!=='ECDSA-P256-SHA256')throw new Error('El paquete no contiene una firma digital válida.');
    const {signature,...core}=payload;
    const calculated=await fingerprint(signature.publicKey);
    if(calculated!==signature.fingerprint)throw new Error('La identidad firmante del paquete no coincide.');
    const key=await crypto.subtle.importKey('jwk',signature.publicKey,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
    const valid=await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,unbase64(signature.value),encoder.encode(stable(core)));
    if(!valid)throw new Error('La firma digital no coincide; el archivo fue modificado.');
    const trusted=await setting(TRUST_KEY);
    if(trusted?.fingerprint&&trusted.fingerprint!==calculated)throw new Error('El paquete fue firmado por una identidad administrativa diferente a la vinculada.');
    if(!trusted&&trustOnFirstUse)await trust(signature.publicKey);
    return {core,fingerprint:calculated,firstTrust:!trusted,pendingTrust:!trusted&&!trustOnFirstUse};
  }
  async function signerFingerprint(){return (await identity()).fingerprint;}
  window.FenologiaPackageSecurity={sign,verify,trust,signerFingerprint,stable};
})();
