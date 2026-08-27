# Servicio central de Fenología 0.17.0

Este directorio contiene el backend que crea y mantiene libros nativos de Google Sheets. No se despliega automáticamente desde el repositorio y no contiene credenciales.

## Instalación de prueba

1. Crea un proyecto independiente en Google Apps Script con la cuenta propietaria de la base.
2. Copia `Code.gs` y activa la visualización del manifiesto para copiar `appsscript.json`.
3. Ejecuta una vez `setupFenologia()` y acepta los permisos solicitados. En una instalación nueva se crearán una carpeta central y el libro `FENOLOGIA_CONTROL_0_17_0`.
4. Para registrar un dispositivo crea las propiedades temporales `FENOLOGIA_PROVISION_ID`, `FENOLOGIA_PROVISION_NAME` y `FENOLOGIA_PROVISION_ROLE`; luego ejecuta `provisionSyncUserFromProperties()` y guarda el token mostrado en el registro. Las propiedades temporales se eliminan después de una ejecución correcta. Repite con los roles `Evaluador`, `Supervisor` y `Administrador`.
5. Despliega como aplicación web: ejecutar como propietario y acceso para cualquier usuario. La autorización real de la API la realizan el ID y el token de cada dispositivo.
6. Copia la URL terminada en `/exec` en el perfil local de la PWA. Usa primero un ambiente y una cuenta de prueba.

## Estructura creada

- Un subdirectorio por campaña.
- Un archivo semanal `FENOLOGIA_YYYY_SWW` dentro de la campaña.
- Hojas `FENOLOGIA`, `BIOMETRIA`, `PARAMETROS_ADICIONALES`, `METADATOS` y `AUDITORIA`.
- Un libro de control con usuarios autorizados, índice general, UUID, dispositivos, alertas, bandeja idempotente y `CONFIG_CENTRAL`.

## Garantías operativas

- `LockService.getScriptLock()` serializa las escrituras concurrentes.
- El UUID, hash, revisión y clave lógica evitan duplicados silenciosos; la bandeja guarda solo un resumen y nunca el token recibido.
- La bandeja y el registro `PROCESSING` permiten reintentar después de una interrupción sin perder el registro.
- El cuadrante es opcional tanto al capturar como al validar en el servidor.
- Un registro se dirige por su fecha de evaluación; no depende de que una tarea semanal se ejecute a tiempo.
- La PWA solo elimina una copia local antigua después de recibir un recibo cuyo hash coincide.
- Solo un Administrador activo puede publicar la configuración operativa; el servidor elimina cualquier credencial antes de guardarla.
- Catálogos, asignaciones, campañas, roles y estados de usuario se propagan en la siguiente conexión.
- Al desactivar un usuario se inhabilita su fila central; el siguiente contacto rechaza el token y cierra la sesión del dispositivo.

## Actualización desde 0.16.0

1. Sustituye `Code.gs` y `appsscript.json` en el proyecto existente.
2. Ejecuta `setupFenologia()` una vez para crear la hoja `CONFIG_CENTRAL` sin reemplazar el libro ni las evaluaciones existentes.
3. Crea una versión nueva en **Implementar > Administrar implementaciones** y actualiza la implementación web existente.
4. Comprueba que la URL `/exec` se mantenga y prueba primero con el Administrador. Los tokens y perfiles 0.16.0 existentes no necesitan regenerarse.
5. La primera conexión del Administrador publica el catálogo y el directorio operativo actuales.

Actualiza primero Apps Script y después la PWA. Si durante la transición un dispositivo 0.17.0 encuentra todavía el servicio 0.16.0, seguirá enviando evaluaciones y consultando el consolidado, pero mostrará pendiente la configuración operativa hasta que el servidor sea actualizado.

## Seguridad

- No compartas el libro de control con los Evaluadores.
- Entrega a cada celular únicamente su propio perfil/token.
- Para revocar un dispositivo ejecuta `revokeSyncUser('EVA-01')` y genera un token nuevo si vuelve a autorizarse.
- Borra los archivos descargados que contengan tokens una vez instalado el perfil.
- Primero prueba con datos ficticios. El despliegue y la cuenta de Drive deben aprobarse por separado.
