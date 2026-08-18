import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root=process.cwd();
const geojson=JSON.parse(await readFile(path.join(root,'data','lotes-mapa.geojson'),'utf8'));
const catalog=JSON.parse(await readFile(path.join(root,'data','catalogos.json'),'utf8'));

if(geojson?.type!=='FeatureCollection'||!Array.isArray(geojson.features)){
  throw new Error('El mapa debe ser una FeatureCollection GeoJSON.');
}

const catalogMetadata=new Map();
for(const [field,farms] of Object.entries(catalog.lotesAgrupados||{})){
  for(const [farm,modules] of Object.entries(farms||{})){
    for(const [module,lots] of Object.entries(modules||{})){
      for(const value of lots||[]){
        const lot=String(value).trim();
        if(!lot)throw new Error('El catálogo contiene un lote vacío.');
        const metadata={CAMPO:field,FUNDO:farm,MODULO:module};
        const previous=catalogMetadata.get(lot);
        if(previous&&JSON.stringify(previous)!==JSON.stringify(metadata)){
          throw new Error(`El lote ${lot} está duplicado en distintas ubicaciones del catálogo.`);
        }
        catalogMetadata.set(lot,metadata);
      }
    }
  }
}

const mapLots=new Set();
const polygons=geometry=>geometry?.type==='Polygon'?[geometry.coordinates]:geometry?.type==='MultiPolygon'?geometry.coordinates:null;
const ringArea=ring=>Math.abs(ring.reduce((sum,[x1,y1],index)=>{
  const [x2,y2]=ring[(index+1)%ring.length];
  return sum+(x1*y2-x2*y1);
},0)/2);
for(const [index,feature] of geojson.features.entries()){
  const lot=String(feature?.properties?.LOTE||'').trim();
  if(!lot)throw new Error(`La geometría ${index+1} no tiene LOTE.`);
  if(mapLots.has(lot))throw new Error(`El lote ${lot} está duplicado en el mapa.`);
  mapLots.add(lot);
  const expected=catalogMetadata.get(lot);
  if(!expected)throw new Error(`El lote ${lot} no existe en el catálogo.`);
  for(const property of ['CAMPO','FUNDO','MODULO']){
    if(String(feature.properties?.[property]||'').trim()!==String(expected[property]).trim()){
      throw new Error(`El lote ${lot} tiene ${property}=${feature.properties?.[property]||'(vacío)'}; se esperaba ${expected[property]}.`);
    }
  }
  const parts=polygons(feature.geometry);
  if(!parts?.length)throw new Error(`El lote ${lot} usa una geometría no admitida o vacía.`);
  for(const polygon of parts){
    if(!Array.isArray(polygon)||!polygon.length)throw new Error(`El lote ${lot} contiene un polígono vacío.`);
    for(const ring of polygon){
      if(!Array.isArray(ring)||ring.length<4)throw new Error(`El lote ${lot} contiene un anillo incompleto.`);
      for(const point of ring){
        if(!Array.isArray(point)||point.length<2||!Number.isFinite(point[0])||!Number.isFinite(point[1])){
          throw new Error(`El lote ${lot} contiene coordenadas inválidas.`);
        }
        if(point[0]<-180||point[0]>180||point[1]<-90||point[1]>90){
          throw new Error(`El lote ${lot} contiene coordenadas fuera del rango geográfico.`);
        }
      }
      const first=ring[0],last=ring[ring.length-1];
      if(first[0]!==last[0]||first[1]!==last[1])throw new Error(`El lote ${lot} contiene un anillo abierto.`);
      if(ringArea(ring)===0)throw new Error(`El lote ${lot} contiene un anillo sin superficie.`);
    }
  }
}

const missingGeometry=[...catalogMetadata.keys()].filter(lot=>!mapLots.has(lot));
const missingCatalog=[...mapLots].filter(lot=>!catalogMetadata.has(lot));
if(missingGeometry.length||missingCatalog.length){
  throw new Error(`Relación incompleta. Sin geometría: ${missingGeometry.join(', ')||'ninguno'}. Sin catálogo: ${missingCatalog.join(', ')||'ninguno'}.`);
}

if(geojson.stats?.lotesActivos!==mapLots.size||geojson.stats?.featuresNormalizadas!==geojson.features.length){
  throw new Error('Las estadísticas declaradas en el GeoJSON no coinciden con sus geometrías.');
}

console.log(`GeoJSON validado: ${mapLots.size} lotes, ${geojson.features.length} geometrías y catálogo completo.`);
