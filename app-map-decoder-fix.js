(() => {
  // Decodificador tolerante para el GeoJSON comprimido de la versión 0.8.0.
  // Limpia caracteres invisibles, normaliza Base64 URL-safe y reconstruye el relleno.
  const nativeAtob = window.atob.bind(window);

  window.atob = function fenologiaSafeAtob(value){
    let clean = String(value ?? '')
      .replace(/\s+/g,'')
      .replace(/-/g,'+')
      .replace(/_/g,'/')
      .replace(/[^A-Za-z0-9+/=]/g,'')
      .replace(/=+$/,'');

    const remainder = clean.length % 4;
    if(remainder === 1){
      // Un carácter sobrante no puede formar Base64 válido; se descarta de forma controlada.
      clean = clean.slice(0,-1);
    }
    clean += '='.repeat((4 - (clean.length % 4)) % 4);
    return nativeAtob(clean);
  };
})();
