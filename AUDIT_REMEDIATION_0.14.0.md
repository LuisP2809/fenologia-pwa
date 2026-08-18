# Remediación de auditoría · 0.14.0

## Datos y captura

- El guardado de evaluaciones espera confirmación de IndexedDB y revierte el estado si falla.
- Los parámetros adicionales se guardan junto con la evaluación en una sola operación lógica.
- La numeración de plantas usa el máximo existente para evitar colisiones después de eliminar o importar registros.
- La edición detecta duplicados y conserva el formulario/registro anterior si no puede persistir.
- **H-02:** el cuadrante es opcional en captura, edición, exportación e importación. Una columna ausente o una celda vacía se proyecta como `""` y no invalida el registro.

## Importación y análisis

- El análisis del Supervisor usa una base temporal y no reemplaza `state.records`.
- Los cambios de selección de archivos son atómicos y no se borra el historial al iniciar.
- JSON, GeoJSON y XLSX tienen límites de tamaño, cantidad y expansión.
- El lector XLSX valida estructura ZIP, límites, CRC y relación de compresión.
- GeoJSON valida tipo, cierre y área de anillos, coordenadas, cantidad y relación con lotes activos.

## Persistencia y respaldo

- IndexedDB actualiza y elimina registros por ID; ya no vacía todo el almacén antes de guardar.
- Las escrituras se serializan y se notifica actividad entre pestañas.
- La limpieza requiere un manifiesto actualizado y una copia persistente o interna verificada.
- La copia interna puede recuperarse desde la propia aplicación.
- Limpieza, restauración, consolidación e importación revierten el estado en memoria cuando falla el guardado.

## Acceso y paquetes

- Credenciales PBKDF2-SHA-256, migración de hashes anteriores, bloqueo temporal y expiración de sesiones.
- No se crean usuarios de demostración en producción.
- Paquetes y perfiles se firman con ECDSA P-256; la primera huella exige confirmación explícita y luego queda vinculada.
- Perfiles de limpieza tienen revisión y vencimiento.

## PWA, construcción y despliegue

- CSP, iconos PNG/maskable y caché limitada a recursos de Fenología.
- Recursos offline y versión se verifican automáticamente.
- GitHub Pages solo publica desde `main`, `release/**` o ejecución manual.
- Pruebas de sintaxis, integridad, criptografía, PWA y GeoJSON son obligatorias en CI.
- Se añadieron auditoría programada de dependencias y Dependabot.
- La auditoría de producción es bloqueante; los avisos sin corrección de `@capacitor/assets` se muestran como riesgo de herramienta y el generador no corre en pull requests.
- Se retiraron `app.js` y `styles.css`, fuentes heredadas que no participaban en la aplicación publicada.

## Riesgo residual conocido

Una PWA completamente local no puede convertir el rol almacenado en el dispositivo en una autoridad de seguridad absoluta ni revocar de inmediato un equipo sin conexión. La mitigación local está implementada; el cierre total requiere autenticación, autorización y auditoría en servidor o administración empresarial del dispositivo. Véase `SECURITY_MODEL.md`.
