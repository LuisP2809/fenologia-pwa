(() => {
  const VERSION='0.18.0';
  const OMITTED_KEYS=new Set(['sync','_sync','syncStatus','syncMessage','lastSyncAttemptAt']);

  function clone(value){
    return typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));
  }

  function stableValue(value){
    if(Array.isArray(value)) return value.map(stableValue);
    if(value&&typeof value==='object'){
      return Object.keys(value).filter(key=>!OMITTED_KEYS.has(key)).sort().reduce((result,key)=>{
        const next=stableValue(value[key]);
        if(next!==undefined) result[key]=next;
        return result;
      },{});
    }
    if(typeof value==='number'&&!Number.isFinite(value)) return null;
    return value===undefined?null:value;
  }

  function canonicalString(value){
    return JSON.stringify(stableValue(value));
  }

  async function sha256(value){
    const bytes=new TextEncoder().encode(typeof value==='string'?value:canonicalString(value));
    const digest=await crypto.subtle.digest('SHA-256',bytes);
    return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  }

  function isoWeekInfo(dateText){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(dateText||''))) throw new Error('La evaluación no tiene una fecha válida.');
    const date=new Date(`${dateText}T12:00:00Z`);
    const day=date.getUTCDay()||7;
    const monday=new Date(date);monday.setUTCDate(date.getUTCDate()-day+1);
    const thursday=new Date(date);thursday.setUTCDate(date.getUTCDate()+4-day);
    const weekYear=thursday.getUTCFullYear();
    const yearStart=new Date(Date.UTC(weekYear,0,1));
    const week=Math.ceil((((thursday-yearStart)/86400000)+1)/7);
    return {week,weekYear,monday:monday.toISOString().slice(0,10),key:`${weekYear}-S${String(week).padStart(2,'0')}`};
  }

  function campaignKey(campaign,dateText){
    const clean=String(campaign||'').trim().replace(/[^0-9A-Za-z_-]+/g,'-').replace(/^-+|-+$/g,'');
    if(clean) return clean;
    const date=new Date(`${dateText}T12:00:00Z`);
    const year=date.getUTCFullYear();
    return date.getUTCMonth()>=9?`${year}-${year+1}`:`${year-1}-${year}`;
  }

  function weekKey(record){
    const week=isoWeekInfo(record?.date);
    return `${campaignKey(record?.campaign,record?.date)}_${week.key}`;
  }

  function businessKey(record){
    const parts=[record?.date,record?.evaluatorId,record?.lot,record?.variety,record?.quadrant||'',record?.plant];
    if(parts.some(value=>value===undefined||value===null||String(value).trim()==='')){
      if(String(record?.quadrant||'')===''&&parts.filter((_,index)=>index!==4).every(value=>value!==undefined&&value!==null&&String(value).trim()!=='')){
        return parts.map(value=>String(value??'').trim().toUpperCase()).join('|');
      }
      throw new Error('No se pudo formar la clave lógica de la evaluación.');
    }
    return parts.map(value=>String(value??'').trim().toUpperCase()).join('|');
  }

  function payloadRecord(record){
    const payload=stableValue(clone(record||{}));
    delete payload.sync;
    delete payload._sync;
    delete payload.syncStatus;
    delete payload.syncMessage;
    delete payload.lastSyncAttemptAt;
    return payload;
  }

  async function queueEntry(record,previous=null){
    if(!record?.id) throw new Error('La evaluación no tiene UUID.');
    const payload=payloadRecord(record);
    const contentHash=await sha256(payload);
    const now=new Date().toISOString();
    const changed=previous?.contentHash&&previous.contentHash!==contentHash;
    return {
      id:record.id,
      recordId:record.id,
      evaluatorId:record.evaluatorId||'',
      evaluator:record.evaluator||'',
      businessKey:businessKey(record),
      weekKey:weekKey(record),
      revision:Math.max(1,Number(previous?.revision||record?.sync?.revision||0)+(changed?1:previous?0:1)),
      baseHash:changed?previous.contentHash:(previous?.baseHash||null),
      contentHash,
      payload,
      status:'pending',
      attempts:changed?0:Number(previous?.attempts||0),
      createdAt:previous?.createdAt||now,
      updatedAt:now,
      nextAttemptAt:now,
      lastError:null
    };
  }

  function retryDelay(attempts){
    const seconds=Math.min(300,Math.max(2,2**Math.min(8,Number(attempts)||0)));
    return seconds*1000;
  }

  function deduplicateRecords(groups){
    const byId=new Map();
    for(const record of groups.flat().filter(Boolean)){
      if(!record?.id) continue;
      const current=byId.get(record.id);
      const currentTime=new Date(current?.updatedAt||current?.createdAt||0).getTime();
      const nextTime=new Date(record.updatedAt||record.createdAt||0).getTime();
      if(!current||nextTime>=currentTime) byId.set(record.id,record);
    }
    return [...byId.values()];
  }

  function cleanupEligible(record,receipt,isQueued,ageInWeeks,retentionWeeks){
    return Boolean(
      record&&receipt&&!isQueued&&
      record.sync?.status==='synced'&&
      record.sync?.contentHash&&record.sync.contentHash===receipt.contentHash&&
      Number(ageInWeeks)>=Math.max(1,Number(retentionWeeks)||1)
    );
  }

  window.FenologiaSyncCore={VERSION,canonicalString,sha256,isoWeekInfo,campaignKey,weekKey,businessKey,payloadRecord,queueEntry,retryDelay,deduplicateRecords,cleanupEligible};
})();
