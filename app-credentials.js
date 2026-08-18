(() => {
  const ITERATIONS=210000;
  const encoder=new TextEncoder();
  const bytesToBase64=bytes=>btoa(String.fromCharCode(...bytes));
  const base64ToBytes=value=>Uint8Array.from(atob(String(value||'')),character=>character.charCodeAt(0));
  const hex=bytes=>[...bytes].map(byte=>byte.toString(16).padStart(2,'0')).join('');

  async function legacyHash(pin){
    return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(`FENOLOGIA|PIN|${String(pin)}`))));
  }
  async function derive(pin,salt,iterations=ITERATIONS){
    const key=await crypto.subtle.importKey('raw',encoder.encode(String(pin)),'PBKDF2',false,['deriveBits']);
    const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations},key,256);
    return new Uint8Array(bits);
  }
  function equal(left,right){
    if(left.length!==right.length)return false;
    let result=0;for(let index=0;index<left.length;index++)result|=left[index]^right[index];return result===0;
  }
  async function create(pin){
    const salt=crypto.getRandomValues(new Uint8Array(16));
    const hash=await derive(pin,salt,ITERATIONS);
    return {pinAlgorithm:'PBKDF2-SHA256',pinIterations:ITERATIONS,pinSalt:bytesToBase64(salt),pinHash:bytesToBase64(hash)};
  }
  async function verify(pin,user){
    if(user?.pinAlgorithm==='PBKDF2-SHA256'&&user.pinSalt&&user.pinHash){
      const actual=await derive(pin,base64ToBytes(user.pinSalt),Number(user.pinIterations)||ITERATIONS);
      return equal(actual,base64ToBytes(user.pinHash));
    }
    return Boolean(user?.pinHash)&&await legacyHash(pin)===user.pinHash;
  }
  window.FenologiaCredentials={create,verify,legacyHash,iterations:ITERATIONS};
})();
