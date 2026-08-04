(() => {
  const DB_NAME = 'fenologia-pwa';
  const DB_VERSION = 1;
  const MIGRATION_KEY = 'indexeddb-migration-v1';
  const LOCAL_MIGRATION_MARKER = 'fenologia-indexeddb-migrated-v1';
  const LEGACY_RECORDS_KEY = 'fenologia-records';
  const LEGACY_ASSIGNMENTS_KEY = 'fenologia-assignments';
  const TRACKED_LOCAL_KEYS = [
    'fenologia-cleanup-admin-profiles-v1',
    'fenologia-cleanup-device-profile-v1',
    'fenologia-cleanup-history-v1',
    'fenologia-cleanup-code-attempts-v1',
    'fenologia-last-backup',
    'fenologia-export-period-v1'
  ];

  let database = null;
  let ready = false;
  let fallbackMode = false;
  let lastSavedAt = null;
  let pendingSave = Promise.resolve();
  let storagePatched = false;

  const parseJson = (value, fallback) => {
    try { return value ? JSON.parse(value) : fallback; }
    catch { return fallback; }
  };

  function requestPromise(request){
    return new Promise((resolve,reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Error de IndexedDB.'));
    });
  }

  function transactionPromise(transaction){
    return new Promise((resolve,reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('No se pudo completar la operación local.'));
      transaction.onabort = () => reject(transaction.error || new Error('La operación local fue cancelada.'));
    });
  }

  function openDatabase(){
    if(database) return Promise.resolve(database);
    if(!('indexedDB' in window)) return Promise.reject(new Error('Este navegador no admite IndexedDB.'));

    return new Promise((resolve,reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = event => {
        const db = event.target.result;
        if(!db.objectStoreNames.contains('records')){
          const records = db.createObjectStore('records',{keyPath:'id'});
          records.createIndex('date','date',{unique:false});
          records.createIndex('evaluatorId','evaluatorId',{unique:false});
          records.createIndex('lot','lot',{unique:false});
        }
        if(!db.objectStoreNames.contains('settings')) db.createObjectStore('settings',{keyPath:'key'});
        if(!db.objectStoreNames.contains('meta')) db.createObjectStore('meta',{keyPath:'key'});
        if(!db.objectStoreNames.contains('imports')){
          const imports = db.createObjectStore('imports',{keyPath:'id'});
          imports.createIndex('importedAt','importedAt',{unique:false});
        }
      };
      request.onsuccess = () => {
        database = request.result;
        database.onversionchange = () => { database.close(); database = null; };
        resolve(database);
      };
      request.onerror = () => reject(request.error || new Error('No se pudo abrir IndexedDB.'));
      request.onblocked = () => reject(new Error('IndexedDB está bloqueado por otra pestaña de la aplicación.'));
    });
  }

  async function getMeta(key){
    const db = await openDatabase();
    const tx = db.transaction('meta','readonly');
    const result = await requestPromise(tx.objectStore('meta').get(key));
    return result?.value ?? null;
  }

  async function setMeta(key,value){
    const db = await openDatabase();
    const tx = db.transaction('meta','readwrite');
    tx.objectStore('meta').put({key,value,updatedAt:new Date().toISOString()});
    await transactionPromise(tx);
  }

  async function getSetting(key){
    const db = await openDatabase();
    const tx = db.transaction('settings','readonly');
    const result = await requestPromise(tx.objectStore('settings').get(key));
    return result?.value ?? null;
  }

  async function setSetting(key,value){
    const db = await openDatabase();
    const tx = db.transaction('settings','readwrite');
    tx.objectStore('settings').put({key,value,updatedAt:new Date().toISOString()});
    await transactionPromise(tx);
  }

  async function removeSetting(key){
    const db = await openDatabase();
    const tx = db.transaction('settings','readwrite');
    tx.objectStore('settings').delete(key);
    await transactionPromise(tx);
  }

  async function migrateLegacyData(){
    const existingMigration = await getMeta(MIGRATION_KEY);
    if(existingMigration) return existingMigration;

    const legacyRecords = parseJson(localStorage.getItem(LEGACY_RECORDS_KEY), []);
    const legacyAssignments = parseJson(localStorage.getItem(LEGACY_ASSIGNMENTS_KEY), {});
    const migratedAt = new Date().toISOString();
    const db = await openDatabase();
    const tx = db.transaction(['records','settings','meta'],'readwrite');
    const recordsStore = tx.objectStore('records');
    const settingsStore = tx.objectStore('settings');
    const metaStore = tx.objectStore('meta');

    if(Array.isArray(legacyRecords)){
      legacyRecords.forEach(record => { if(record?.id) recordsStore.put(record); });
    }
    settingsStore.put({key:'assignments',value:legacyAssignments,updatedAt:migratedAt});

    TRACKED_LOCAL_KEYS.forEach(key => {
      const value = localStorage.getItem(key);
      if(value !== null) settingsStore.put({key:`local:${key}`,value,updatedAt:migratedAt});
    });

    const migration = {
      migratedAt,
      recordCount:Array.isArray(legacyRecords)?legacyRecords.length:0,
      assignmentsCount:Object.keys(legacyAssignments || {}).length,
      legacyKeysPreserved:true,
      source:'localStorage'
    };
    metaStore.put({key:MIGRATION_KEY,value:migration,updatedAt:migratedAt});
    await transactionPromise(tx);

    // Los datos antiguos permanecen intactos como copia de recuperación.
    localStorage.setItem(LOCAL_MIGRATION_MARKER,JSON.stringify(migration));
    return migration;
  }

  async function loadBootstrapState(){
    const db = await openDatabase();
    const tx = db.transaction(['records','settings'],'readonly');
    const recordsRequest = tx.objectStore('records').getAll();
    const assignmentsRequest = tx.objectStore('settings').get('assignments');
    const [records,assignmentsEntry] = await Promise.all([
      requestPromise(recordsRequest),
      requestPromise(assignmentsRequest)
    ]);
    return {records:records || [],assignments:assignmentsEntry?.value || {}};
  }

  async function reconcileTrackedSettings(){
    for(const key of TRACKED_LOCAL_KEYS){
      const localValue = localStorage.getItem(key);
      const storedValue = await getSetting(`local:${key}`);
      if(localValue !== null){
        if(localValue !== storedValue) await setSetting(`local:${key}`,localValue);
      }else if(storedValue !== null){
        localStorage.setItem(key,storedValue);
      }
    }
  }

  function patchLocalSettingsMirror(){
    if(storagePatched) return;
    storagePatched = true;
    const originalSetItem = Storage.prototype.setItem;
    const originalRemoveItem = Storage.prototype.removeItem;

    Storage.prototype.setItem = function(key,value){
      originalSetItem.call(this,key,value);
      if(this === localStorage && TRACKED_LOCAL_KEYS.includes(String(key)) && ready && !fallbackMode){
        setSetting(`local:${key}`,String(value)).catch(() => {});
      }
    };

    Storage.prototype.removeItem = function(key){
      originalRemoveItem.call(this,key);
      if(this === localStorage && TRACKED_LOCAL_KEYS.includes(String(key)) && ready && !fallbackMode){
        removeSetting(`local:${key}`).catch(() => {});
      }
    };
  }

  async function writeAppState(records,assignments){
    const db = await openDatabase();
    const tx = db.transaction(['records','settings'],'readwrite');
    const recordsStore = tx.objectStore('records');
    recordsStore.clear();
    (records || []).forEach(record => { if(record?.id) recordsStore.put(record); });
    tx.objectStore('settings').put({key:'assignments',value:assignments || {},updatedAt:new Date().toISOString()});
    await transactionPromise(tx);
    lastSavedAt = new Date().toISOString();
    window.dispatchEvent(new CustomEvent('fenologia-db-status',{detail:{status:'saved',lastSavedAt}}));
  }

  function saveAppState(records,assignments){
    if(fallbackMode){
      localStorage.setItem(LEGACY_RECORDS_KEY,JSON.stringify(records || []));
      localStorage.setItem(LEGACY_ASSIGNMENTS_KEY,JSON.stringify(assignments || {}));
      return Promise.resolve();
    }
    window.dispatchEvent(new CustomEvent('fenologia-db-status',{detail:{status:'saving'}}));
    pendingSave = pendingSave.catch(() => {}).then(() => writeAppState(records,assignments));
    return pendingSave.catch(error => {
      console.error('IndexedDB save failed',error);
      window.dispatchEvent(new CustomEvent('fenologia-db-status',{detail:{status:'error',message:error.message}}));
      throw error;
    });
  }

  async function flush(){
    try { await pendingSave; }
    catch { /* El error ya se informó mediante el evento de estado. */ }
  }

  async function prepare(){
    try{
      await openDatabase();
      const migration = await migrateLegacyData();
      await reconcileTrackedSettings();
      const bootstrapState = await loadBootstrapState();
      window.__FENOLOGIA_BOOTSTRAP_STATE__ = bootstrapState;
      window.__FENOLOGIA_MIGRATION_INFO__ = migration;
      ready = true;
      patchLocalSettingsMirror();
      return {ok:true,migration,recordCount:bootstrapState.records.length};
    }catch(error){
      console.error('IndexedDB unavailable; using legacy storage',error);
      fallbackMode = true;
      ready = true;
      window.__FENOLOGIA_BOOTSTRAP_STATE__ = {
        records:parseJson(localStorage.getItem(LEGACY_RECORDS_KEY),[]),
        assignments:parseJson(localStorage.getItem(LEGACY_ASSIGNMENTS_KEY),{})
      };
      window.__FENOLOGIA_DB_ERROR__ = error.message;
      return {ok:false,error:error.message,recordCount:window.__FENOLOGIA_BOOTSTRAP_STATE__.records.length};
    }
  }

  async function status(){
    const migration = fallbackMode ? null : await getMeta(MIGRATION_KEY);
    return {
      ready,
      fallbackMode,
      database:DB_NAME,
      version:DB_VERSION,
      lastSavedAt,
      migration,
      recordCount:window.__FENOLOGIA_BOOTSTRAP_STATE__?.records?.length || 0
    };
  }

  window.addEventListener('pagehide',() => { flush(); });
  document.addEventListener('visibilitychange',() => { if(document.visibilityState === 'hidden') flush(); });

  window.FenologiaDB = {
    prepare,
    saveAppState,
    flush,
    status,
    getSetting,
    setSetting,
    removeSetting,
    getMeta,
    setMeta,
    isReady:() => ready,
    isFallback:() => fallbackMode,
    migrationInfo:() => window.__FENOLOGIA_MIGRATION_INFO__ || null
  };
})();
