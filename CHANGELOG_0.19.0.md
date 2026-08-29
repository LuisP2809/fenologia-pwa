# Usuarios y activación simplificados · 0.19.0

## Cambios

- **Usuarios y roles** utiliza una pantalla directa inspirada en el flujo probado de Fitosanidad.
- Crear un Evaluador o Supervisor es una sola operación central: nombre, usuario y rol.
- Apps Script asigna automáticamente `EVA-###` o `SUP-###` y devuelve el QR, enlace y código temporal.
- El acceso recién creado aparece dentro de la misma pantalla, sin ventanas encadenadas.
- El formulario tiene un manejador propio, estado de progreso, prevención de doble envío y errores persistentes.
- La lista central se puede actualizar independientemente con **Actualizar usuarios**.
- Cada usuario permite **Desactivar/Activar** y **Nuevo acceso**; `ADM-001` permanece protegido.
- En dispositivos configurados, el ingreso muestra `Dispositivo configurado para [persona]` y oculta la activación.
- En dispositivos nuevos, el usuario escanea el QR o escribe el código y crea su PIN local.

## Compatibilidad

- Conserva `ADM-001`, su token, su PIN local y la URL actual de Apps Script.
- No reinicia catálogos, evaluaciones, archivos semanales ni configuración central.
- Acepta perfiles de sincronización 0.18.0 existentes durante la transición.
- Requiere actualizar primero Apps Script a 0.19.0 y después publicar la PWA.
