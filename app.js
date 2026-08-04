const normalizeBase64=value=>{
  let clean=String(value??'')
    .replace(/^\uFEFF/,'')
    .replace(/\s+/g,'')
    .replace(/-/g,'+')
    .replace(/_/g,'/')
    .replace(/[^A-Za-z0-9+/=]/g,'');
  clean=clean.replace(/=+$/,'');
  clean+='='.repeat((4-(clean.length%4))%4);
  return clean;
};

const decode=async value=>{
  const normalized=normalizeBase64(value);
  if(!normalized)throw new Error('El contenido de la aplicación llegó vacío.');
  const binary=atob(normalized);
  const bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));
  if(typeof DecompressionStream==='undefined')throw new Error('Este navegador no permite descomprimir la aplicación. Actualiza Chrome o Edge.');
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
};

const read=async paths=>{
  const parts=[];
  for(const path of paths){
    const separator=path.includes('?')?'&':'?';
    const response=await fetch(`${path}${separator}v=0.2.1`,{cache:'no-store'});
    if(!response.ok)throw new Error(`No se pudo cargar ${path} (${response.status}).`);
    parts.push(await response.text());
  }
  return parts.join('');
};

Promise.all([
  read(['./payload/js0.txt','./payload/js1.txt','./payload/js2.txt','./payload/js3.txt','./payload/js4.txt','./payload/js5.txt']),
  read(['./payload/css0.txt','./payload/css1.txt'])
]).then(async([jsPayload,cssPayload])=>{
  const[code,css]=await Promise.all([decode(jsPayload),decode(cssPayload)]);
  const style=document.createElement('style');
  style.textContent=css;
  document.head.appendChild(style);
  (0,eval)(code);
}).catch(error=>{
  console.error('Error al cargar Fenología:',error);
  document.querySelector('#app').innerHTML=`<main style="padding:30px;font-family:system-ui;max-width:900px;margin:auto"><h1>No se pudo cargar Fenología</h1><p>${error.message}</p><button onclick="location.reload()" style="border:0;border-radius:10px;background:#08783d;color:white;padding:12px 18px;font-weight:700;cursor:pointer">Volver a intentar</button></main>`;
});
