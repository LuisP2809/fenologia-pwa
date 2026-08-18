import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';

const root=process.cwd();
const chunks=[];
for(let index=1;index<=5;index+=1){
  const source=await readFile(path.join(root,'data',`map-inline-${index}.js`),'utf8');
  const match=source.match(/\+\(?['"]([A-Za-z0-9+/=]+)['"]/);
  if(!match)throw new Error(`No se pudo leer el bloque map-inline-${index}.js.`);
  chunks.push(match[1]);
}

const geojson=JSON.parse(gunzipSync(Buffer.from(chunks.join(''),'base64')).toString('utf8'));
const catalog=JSON.parse(await readFile(path.join(root,'data','catalogos.json'),'utf8'));
const metadata=new Map();
for(const [field,farms] of Object.entries(catalog.lotesAgrupados||{})){
  for(const [farm,modules] of Object.entries(farms||{})){
    for(const [module,lots] of Object.entries(modules||{})){
      for(const lot of lots||[])metadata.set(String(lot).trim(),{CAMPO:field,FUNDO:farm,MODULO:module});
    }
  }
}

for(const feature of geojson.features||[]){
  const lot=String(feature?.properties?.LOTE||'').trim();
  const values=metadata.get(lot);
  if(!values)throw new Error(`El lote ${lot||'(vacío)'} no existe en el catálogo.`);
  feature.properties={...(feature.properties||{}),...values,LOTE:lot,ACTIVO:true,TIPO:'LOTE'};
}

geojson.stats={
  ...(geojson.stats||{}),
  lotesActivos:geojson.features.length,
  zonasReferencia:0,
  poligonosSinCodigoOmitidos:0,
  featuresNormalizadas:geojson.features.length
};

await writeFile(path.join(root,'data','lotes-mapa.geojson'),`${JSON.stringify(geojson)}\n`,'utf8');
console.log(`GeoJSON materializado: ${geojson.features.length} lotes.`);
