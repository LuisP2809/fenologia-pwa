# Servicio central de Fenología 0.15.0

Este directorio contiene el backend que crea y mantiene libros nativos de Google Sheets. No se despliega automáticamente desde el repositorio y no contiene credenciales.

## Instalación de prueba

1. Crea un proyecto independiente en Google Apps Script con la cuenta propietaria de la base.
2. Copia `Code.gs` y activa la visualización del manifiesto para copiar `appsscript.json`.
3. Ejecuta una vez `setupFenologia()` y acepta los permisos solicitados. Se crearán una carpeta central y el libro `FENOLOGIA_CONTROL_0_15_0`.
4. Ejecuta `registerSyncUser('EVA-01','Nombre evaluador','Evaluador')` por cada dispositivo y guarda el token que devuelve. Repite con los roles `Supervisor` y `Administrador`.
5. Despliega como aplicación web: ejecutar como propietario y acceso para cualquier usuario. La autorización real de la API la realizan el ID y el token de cada dispositivo.
6. Copia la URL terminada en `/exec` en el perfil local de la PWA. Usa primero un ambiente y una cuenta de prueba.

## Estructura creada

- Un subdirectorio por campaña.
- Un archivo semanal `FENOLOGIA_YYYY_SWW` dentro de la campaña.
- Hojas `FENOLOGIA`, `BIOMETRIA`, `PARAMETROS_ADICIONALES`, `METADATOS` y `AUDITORIA`.
- Un libro de control con usuarios autorizados, índice general, UUID, dispositivos, alertas y bandeja idempotente.

## Garantías operativas

- `LockService.getScriptLock()` serializa las escrituras concurrentes.
- El UUID, hash, revisión y clave lógica evitan duplicados silenciosos; la bandeja guarda solo un resumen y nunca el token recibido.
- La bandeja y el registro `PROCESSING` permiten reintentar después de una interrupción sin perder el registro.
- El cuadrante es opcional tanto al capturar como al validar en el servidor.
- Un registro se dirige por su fecha de evaluación; no depende de que una tarea semanal se ejecute a tiempo.
- La PWA solo elimina una copia local antigua después de recibir un recibo cuyo hash coincide.

## Seguridad

- No compartas el libro de control con los Evaluadores.
- Entrega a cada celular únicamente su propio perfil/token.
- Para revocar un dispositivo ejecuta `revokeSyncUser('EVA-01')` y genera un token nuevo si vuelve a autorizarse.
- Borra los archivos descargados que contengan tokens una vez instalado el perfil.
- Primero prueba con datos ficticios. El despliegue y la cuenta de Drive deben aprobarse por separado.
