import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root=process.cwd();
const geojson=JSON.parse(await readFile(path.join(root,'data','lotes-mapa.geojson'),'utf8'));
const catalog=JSON.parse(await readFile(path.join(root,'data','catalogos.json'),'utf8'));

if(geojson?.type!=='FeatureCollection'||!Array.isArray(geojson.features)){
  throw new Error('El mapa debe ser una FeatureCollection GeoJSON.');
}

const catalogLots=new Set();
for(const farms of Object.values(catalog.lotesAgrupados||{})){
  for(const modules of Object.values(farms||{})){
    for(const lots of Object.values(modules||{})){
      for(const lot of lots||[])catalogLots.add(String(lot).trim());
    }
  }
}

const mapLots=new Set();
const polygons=geometry=>geometry?.type==='Polygon'?[geometry.coordinates]:geometry?.type==='MultiPolygon'?geometry.coordinates:null;
for(const [index,feature] of geojson.features.entries()){
  const lot=String(feature?.properties?.LOTE||'').trim();
  if(!lot)throw new Error(`La geometría ${index+1} no tiene LOTE.`);
  if(mapLots.has(lot))throw new Error(`El lote ${lot} está duplicado en el mapa.`);
  mapLots.add(lot);
  const parts=polygons(feature.geometry);
  if(!parts)throw new Error(`El lote ${lot} usa una geometría no admitida.`);
  for(const polygon of parts){
    for(const ring of polygon){
      if(!Array.isArray(ring)||ring.length<4)throw new Error(`El lote ${lot} contiene un anillo incompleto.`);
      for(const point of ring){
        if(!Array.isArray(point)||point.length<2||!Number.isFinite(point[0])||!Number.isFinite(point[1])){
          throw new Error(`El lote ${lot} contiene coordenadas inválidas.`);
        }
      }
      const first=ring[0],last=ring[ring.length-1];
      if(first[0]!==last[0]||first[1]!==last[1])throw new Error(`El lote ${lot} contiene un anillo abierto.`);
    }
  }
}

const missingGeometry=[...catalogLots].filter(lot=>!mapLots.has(lot));
const missingCatalog=[...mapLots].filter(lot=>!catalogLots.has(lot));
if(missingGeometry.length||missingCatalog.length){
  throw new Error(`Relación incompleta. Sin geometría: ${missingGeometry.join(', ')||'ninguno'}. Sin catálogo: ${missingCatalog.join(', ')||'ninguno'}.`);
}

console.log(`GeoJSON validado: ${mapLots.size} lotes, ${geojson.features.length} geometrías y catálogo completo.`);
