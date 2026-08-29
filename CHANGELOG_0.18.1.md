# Acceso y creación de usuarios · 0.18.1

## Cambios

- Un dispositivo ya configurado muestra únicamente `Dispositivo configurado para [persona]` en el ingreso normal.
- El botón de activación continúa disponible solo en dispositivos que todavía no tienen usuario.
- La creación de Evaluadores y Supervisores muestra progreso dentro del formulario.
- El botón queda temporalmente bloqueado durante el envío para evitar duplicados.
- Los errores de conexión, credencial y usuario repetido permanecen visibles dentro de la ventana.
- El nombre de usuario se normaliza en minúsculas mientras se escribe.
- Las notificaciones generales se muestran por encima de las ventanas administrativas.

## Compatibilidad

- No requiere cambios adicionales en Apps Script 0.18.0.
- No altera `ADM-001`, catálogos, evaluaciones, códigos ya emitidos ni archivos de Drive.
