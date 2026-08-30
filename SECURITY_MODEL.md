# Modelo de seguridad local y central

Fenología 0.20.0 continúa siendo *offline-first*: primero confirma el guardado en el dispositivo y después sincroniza. Apps Script administra identidades, activaciones y revocaciones centrales.

## Controles implementados

- Credenciales derivadas con PBKDF2-SHA-256 y migración automática de hashes antiguos.
- Bloqueo temporal tras intentos fallidos y sesiones con expiración e inactividad máxima.
- Código inicial de Administrador y códigos de activación almacenados mediante huella, válidos por 24 horas y de un solo uso.
- Cola y recibos separados en IndexedDB; una copia local no se elimina sin estado confirmado y coincidencia de hash.
- Tokens individuales: el servidor conserva únicamente su hash y las consultas se firman con HMAC, timestamp y nonce.
- La configuración central excluye PIN/DNI, hashes de credenciales, sales y tokens; solamente distribuye datos operativos.
- Los cambios concurrentes de una misma revisión administrativa se bloquean como conflicto en lugar de sobrescribirse silenciosamente.
- Bloqueo global de Apps Script, UUID, clave lógica, hash, revisión, bandeja de entrada y auditoría central.
- Política CSP, límites de tamaño y validación estructural de JSON, GeoJSON y XLSX.
- Etapa de sistema identificada: los perfiles JSON anteriores al inicio limpio 0.18.0 son rechazados.

## Inicio inicial y distribución de accesos

Al abrir 0.18.0 por primera vez, Fenología retira una sola vez usuarios, sesiones y credenciales anteriores. No elimina IndexedDB, evaluaciones locales ni archivos de Drive.

Con `USUARIOS_SYNC` vacío, `prepareInitialAdmin()` genera el código que permite crear únicamente `ADM-001`. Desde ese Administrador se crean Evaluadores y Supervisores. Cada destinatario activa su dispositivo con QR, enlace o código y define su propio PIN; no recibe tokens ni perfiles JSON visibles.

## Límites y operación

Una persona con control completo del dispositivo todavía puede alterar su almacenamiento o el código instalado, pero no puede escribir en la base central sin un token activo. La revocación central se aplica en el siguiente contacto y cierra la sesión local; un equipo sin conexión puede continuar temporalmente con la sesión y los datos que ya tenía, pero no puede consolidar registros después de la revocación. Las evaluaciones locales no se borran por desactivar un usuario.

Apps Script se ejecuta con la cuenta propietaria y sus cuotas. Los tokens no deben guardarse en el repositorio ni compartirse entre evaluadores. El libro de control debe mantenerse privado. La URL pública del web app no reemplaza la autenticación del dispositivo.

La primera firma administrativa aceptada usa confianza inicial (TOFU). Su huella debe compararse por un canal administrativo independiente antes de distribuir paquetes.

La auditoría bloquea vulnerabilidades altas o críticas en dependencias que se distribuyen. `@capacitor/assets` 3.0.5 —la versión más reciente publicada— mantiene avisos en herramientas de generación de imágenes que no forman parte de la PWA ni del APK resultante. CI los informa por separado y no ejecuta ese generador con código de pull requests; deben revisarse cuando el proveedor publique una actualización.
