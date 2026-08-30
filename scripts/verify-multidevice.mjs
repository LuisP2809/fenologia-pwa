import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const assert=(condition,message)=>{if(!condition)throw new Error(message);};

class FakeRange{
  constructor(sheet,row,column,rows=1,columns=1){this.sheet=sheet;this.row=row;this.column=column;this.rows=rows;this.columns=columns;}
  getValue(){return this.getValues()[0][0];}
  getValues(){return Array.from({length:this.rows},(_,r)=>Array.from({length:this.columns},(_,c)=>this.sheet.value(this.row+r,this.column+c)));}
  setValue(value){return this.setValues([[value]]);}
  setValues(values){for(let r=0;r<this.rows;r++)for(let c=0;c<this.columns;c++)this.sheet.assign(this.row+r,this.column+c,values[r]?.[c]??'');return this;}
  setFontWeight(){return this;}setBackground(){return this;}setFontColor(){return this;}
  createTextFinder(value){
    const range=this;
    return {matchEntireCell(){return this;},findNext(){
      for(let r=0;r<range.rows;r++)for(let c=0;c<range.columns;c++)if(String(range.sheet.value(range.row+r,range.column+c))===String(value))return {getRow:()=>range.row+r};
      return null;
    }};
  }
}

class FakeSheet{
  constructor(name,rows){this.name=name;this.rows=rows.map(row=>[...row]);this.maxColumns=Math.max(1,...this.rows.map(row=>row.length));}
  value(row,column){return this.rows[row-1]?.[column-1]??'';}
  assign(row,column,value){while(this.rows.length<row)this.rows.push([]);while(this.rows[row-1].length<column)this.rows[row-1].push('');this.rows[row-1][column-1]=value;this.maxColumns=Math.max(this.maxColumns,column);}
  getLastRow(){for(let index=this.rows.length-1;index>=0;index--)if(this.rows[index].some(value=>value!==''&&value!==null&&value!==undefined))return index+1;return 0;}
  getLastColumn(){return Math.max(this.maxColumns,...this.rows.map(row=>row.length));}
  getMaxColumns(){return this.maxColumns;}
  insertColumnsAfter(_after,count){this.maxColumns+=count;}
  getRange(row,column,rows=1,columns=1){return new FakeRange(this,row,column,rows,columns);}
  appendRow(values){this.rows.push([...values]);this.maxColumns=Math.max(this.maxColumns,values.length);}
  setFrozenRows(){}
}

const pcToken='PC-TOKEN-SEGURO-'.padEnd(64,'P');
const pcHash=createHash('sha256').update(pcToken).digest('hex');
const users=new FakeSheet('USUARIOS_SYNC',[
  ['USUARIO ID','USUARIO','NOMBRE','ROL','TOKEN HASH','ACTIVO','CREADO','ÚLTIMO ACCESO'],
  ['ADM-001','admin','Luis Pineda','Administrador',pcHash,true,new Date('2026-08-30T00:00:00Z'),'']
]);
const devices=new FakeSheet('DISPOSITIVOS',[
  ['DISPOSITIVO ID','EVALUADOR ID','NOMBRE','ROL','ÚLTIMO CONTACTO','PENDIENTES','VERSIÓN APP','ESTADO','TOKEN HASH','CREDENCIAL ACTIVA','CREDENCIAL CREADA','ÚLTIMO USO CREDENCIAL','ETIQUETA']
]);
const mockBook={getSheetByName(name){return name==='USUARIOS_SYNC'?users:name==='DISPOSITIVOS'?devices:null;}};
const Utilities={
  DigestAlgorithm:{SHA_256:'SHA_256'},Charset:{UTF_8:'UTF_8'},
  computeDigest(_algorithm,value){return [...createHash('sha256').update(String(value)).digest()];},
  getUuid:randomUUID
};
const context={Date,JSON,Math,Number,String,Array,Object,Set,Map,console,Utilities,mockBook};
vm.createContext(context);
const source=await readFile('apps-script/Code.gs','utf8');
vm.runInContext(`${source}\nruntimeControlCache=mockBook;globalThis.multiDeviceApi={authenticatePost_,issueDeviceProfile_,findDeviceCredential_};`,context,{filename:'apps-script/Code.gs'});
const api=context.multiDeviceApi;

api.authenticatePost_({evaluatorId:'ADM-001',deviceId:'DEV-PC-PRINCIPAL',deviceToken:pcToken});
const migratedPc=api.findDeviceCredential_('DEV-PC-PRINCIPAL','ADM-001');
assert(migratedPc?.active&&migratedPc.label==='Dispositivo principal migrado','La PC existente no se migró conservando su token.');

const mobileProfile=api.issueDeviceProfile_('ADM-001','DEV-CELULAR-LUIS','Celular');
assert(mobileProfile.deviceToken!==pcToken&&mobileProfile.evaluatorId==='ADM-001','El celular no recibió una credencial independiente para ADM-001.');
api.authenticatePost_({evaluatorId:'ADM-001',deviceId:'DEV-CELULAR-LUIS',deviceToken:mobileProfile.deviceToken});
api.authenticatePost_({evaluatorId:'ADM-001',deviceId:'DEV-PC-PRINCIPAL',deviceToken:pcToken});

const mobile=api.findDeviceCredential_('DEV-CELULAR-LUIS','ADM-001');
devices.getRange(mobile.row,10).setValue(false);
let mobileRevoked=false;
try{api.authenticatePost_({evaluatorId:'ADM-001',deviceId:'DEV-CELULAR-LUIS',deviceToken:mobileProfile.deviceToken});}catch(error){mobileRevoked=/revocado/i.test(error.message);}
assert(mobileRevoked,'Revocar el celular no bloqueó su credencial.');
api.authenticatePost_({evaluatorId:'ADM-001',deviceId:'DEV-PC-PRINCIPAL',deviceToken:pcToken});

console.log('Multidispositivo validado: PC migrada, celular independiente, uso simultáneo y revocación aislada.');
