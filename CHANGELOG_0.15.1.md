# Corrección de acceso y actualización · 0.15.1

Estado: candidata local, sin publicar.

## Correcciones

- La versión aparece siempre en la pantalla de ingreso.
- Una actualización pendiente puede activarse aunque todavía no exista una sesión iniciada.
- Un puente de arranque externo reemplaza primero la caché 0.15.0 y solo después carga los módulos 0.15.1.
- El aviso de actualización también se muestra dentro de la tarjeta de bienvenida.
- Cada usuario dispone de un único botón **Preparar dispositivo**.
- El asistente completa automáticamente ID, nombre y rol para evitar cruces.
- El asistente diferencia el acceso local obligatorio del perfil posterior de Google Drive.
- Los perfiles de sincronización 0.15.0 existentes continúan siendo compatibles.

## Seguridad

- El token de Apps Script no se guarda en la ficha del usuario.
- El token se limpia del formulario después de descargar el perfil.
- El acceso y el perfil conservan archivos separados para evitar que un token central se distribuya innecesariamente.
- No se borran sesiones, evaluaciones, colas pendientes ni recibos durante la actualización.

## Validación realizada

- Sintaxis e integridad de 37 archivos JavaScript.
- Actualización pendiente desde la pantalla de ingreso, sin crear ni alterar sesiones.
- Perfiles nuevos 0.15.1 y compatibilidad de perfiles 0.15.0 existentes.
- Sincronización de 2.400 evaluaciones, reenvíos, conflictos, semanas ISO y limpieza confirmada.
- Construcción PWA, recursos offline, criptografía, datos geográficos y paquete web.

Antes de publicar, falta únicamente la prueba de aceptación del usuario en un dispositivo real.
