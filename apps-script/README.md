# Servicio central de Fenología 0.20.0

Este directorio contiene el backend que crea y mantiene libros nativos de Google Sheets. No se despliega automáticamente desde el repositorio y no contiene credenciales.

## Instalación de prueba

1. Crea un proyecto independiente en Google Apps Script con la cuenta propietaria de la base.
2. Copia `Code.gs` y activa la visualización del manifiesto para copiar `appsscript.json`.
3. Ejecuta una vez `setupFenologia()` y acepta los permisos solicitados. En una instalación nueva se crearán una carpeta central y el libro `FENOLOGIA_CONTROL_0_18_0`.
4. Con `USUARIOS_SYNC` vacío, ejecuta `prepareInitialAdmin()`. Copia privadamente el `setupCode` mostrado; vence en 24 horas y solo crea `ADM-001`.
5. Despliega como aplicación web: ejecutar como propietario y acceso para cualquier usuario. La autorización real de la API la realizan el ID y el token de cada dispositivo.
6. En la pantalla inicial de la PWA ingresa nombre, usuario, PIN y `setupCode`. Después crea los demás usuarios desde **Usuarios y roles** y comparte su QR o código temporal.

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
- Los códigos de activación vencen en 24 horas, se guardan mediante hash y se eliminan al usarse.
- Cada activación rota el token del usuario, por lo que un acceso anterior deja de sincronizar.
- Si se pierde el dispositivo principal, `prepareAdminRecovery()` genera un código temporal para reinstalar `ADM-001`; no crea otro Administrador.

## Actualización desde 0.18.0 conservando el Administrador

1. Sustituye `Code.gs` en el proyecto existente y ejecuta `setupFenologia()` una vez.
2. Actualiza la implementación web existente sin cambiar la URL `/exec`.
3. No ejecutes `prepareInitialAdmin()` y no borres `USUARIOS_SYNC`: `ADM-001` y su token continúan vigentes.
4. Publica después la PWA 0.20.0 y comprueba la pantalla directa de **Usuarios y roles**.

Los nuevos usuarios reciben un código y QR de un solo uso. El servicio 0.20.0 conserva libros, catálogos y evaluaciones creados por 0.18.0.

## Instalación limpia desde una versión anterior

1. Sustituye `Code.gs` y `appsscript.json` en el proyecto existente.
2. Ejecuta `setupFenologia()` una vez para actualizar las cabeceras sin reemplazar el libro ni las evaluaciones existentes.
3. Crea una versión nueva en **Implementar > Administrar implementaciones** y actualiza la implementación web existente.
4. Con la hoja `USUARIOS_SYNC` vacía, ejecuta `prepareInitialAdmin()` y usa el código en la PWA 0.20.0.
5. Comprueba que la URL `/exec` se mantenga. Los perfiles JSON y tokens anteriores quedan reemplazados deliberadamente.

Actualiza primero Apps Script y después la PWA. No actives 0.20.0 contra un servicio anterior que no incluya los códigos temporales.

## Seguridad

- No compartas el libro de control con los Evaluadores.
- Comparte cada QR o código únicamente con su destinatario.
- Desactiva usuarios desde la PWA; para recuperación técnica sigue disponible `revokeSyncUser('EVA-001')`.
- Si un enlace se comparte por error, genera un **Nuevo acceso**: el código anterior vencerá o quedará reemplazado al activarse el nuevo.
- Primero prueba con datos ficticios. El despliegue y la cuenta de Drive deben aprobarse por separado.
