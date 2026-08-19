# Inicio limpio y primer Administrador · 0.16.0

## Cambio solicitado

- Al abrir esta versión, cada dispositivo elimina una sola vez los datos locales anteriores de Fenología: usuarios, roles, sesiones, evaluaciones, colas y configuraciones.
- La eliminación no afecta archivos, libros ni registros que ya existan en Google Drive o Google Sheets.
- El borrado se limita a IndexedDB y claves locales propias de Fenología; no se limpia todo el almacenamiento del dominio.

## Nuevo inicio

- Si no hay usuarios, la bienvenida muestra **Crear primer Administrador**.
- El formulario solicita nombre, DNI/PIN de ocho dígitos, confirmación y verificación de que es el dispositivo principal.
- El primer usuario se crea como `ADM-001` con rol **Administrador principal** y abre una sesión local protegida.
- Desde esa cuenta se crean Evaluadores y Supervisores y se descargan sus archivos mediante **Preparar dispositivo**.
- Los demás celulares usan **Importar acceso**; no crean Administradores adicionales desde la bienvenida.

## Incompatibilidad intencional

- Los accesos administrativos generados antes de 0.16.0 quedan rechazados.
- Los perfiles de sincronización 0.15.x quedan rechazados y deben volver a generarse.
- Esta separación evita reintroducir usuarios, roles o vínculos pertenecientes a la configuración eliminada.

## Validación

- Reinicio único de la base `fenologia-pwa` y de claves propias.
- Conservación de claves ajenas alojadas en el mismo dominio.
- Creación guiada del Administrador principal.
- Rechazo de accesos y perfiles anteriores.
- Validación completa de sintaxis, integridad, criptografía, sincronización, 2.400 registros y recursos offline.
