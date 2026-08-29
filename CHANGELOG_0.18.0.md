# Acceso simplificado con QR · 0.18.0

## Nuevo inicio

- El sistema comienza con un único `ADM-001`, creado mediante un código inicial de un solo uso generado por Apps Script.
- El Administrador define su usuario y PIN en la pantalla inicial; el PIN se deriva localmente con PBKDF2 y nunca se envía al servidor.
- La actualización retira usuarios, sesiones y tokens anteriores sin borrar evaluaciones locales ni archivos de Drive.

## Usuarios y roles

- Desde **Usuarios y roles** se crean Evaluadores y Supervisores con nombre, usuario y rol.
- Cada creación genera automáticamente un QR, enlace y código temporal.
- El código vence en 24 horas, solo funciona una vez y su uso rota el token central del usuario.
- El destinatario abre el enlace o escanea el QR, crea su propio PIN y entra sin importar archivos JSON.
- Un acceso renovado invalida el token instalado anteriormente.
- La desactivación se aplica en Apps Script y bloquea la siguiente conexión, sin eliminar evaluaciones.

## Compatibilidad y seguridad

- Los perfiles JSON de 0.16.0 y 0.17.0 dejan de aceptarse después de este reinicio deliberado de acceso.
- Apps Script almacena únicamente hashes de tokens y códigos temporales.
- El QR se genera dentro del PWA con una dependencia local, por lo que no envía el enlace a servicios externos.
- Se evita que una configuración central todavía en propagación cierre la sesión de un usuario recién activado.

## Validación

- Administrador único, API administrativa autenticada, QR, enlace, vencimiento y desactivación central.
- 2,400 evaluaciones, reenvíos, conflictos, cola offline y confirmación en Drive.
- PWA, caché offline, GeoJSON de 254 lotes y paquete web 0.18.0.
- Auditoría de dependencias de producción: 0 vulnerabilidades.
