# Modelo de seguridad local y central

Fenología 0.15.0 continúa siendo *offline-first*: primero confirma el guardado en el dispositivo y después sincroniza. El servicio de Apps Script añade autoridad central cuando está instalado; sin ese despliegue, la aplicación permanece en modo local protegido.

## Controles implementados

- Credenciales derivadas con PBKDF2-SHA-256 y migración automática de hashes antiguos.
- Bloqueo temporal tras intentos fallidos y sesiones con expiración e inactividad máxima.
- Paquetes de configuración firmados con ECDSA P-256.
- Vinculación de la primera identidad firmante y rechazo de cambios posteriores no autorizados.
- Cola y recibos separados en IndexedDB; una copia local no se elimina sin estado confirmado y coincidencia de hash.
- Tokens individuales: el servidor conserva únicamente su hash y las consultas se firman con HMAC, timestamp y nonce.
- Bloqueo global de Apps Script, UUID, clave lógica, hash, revisión, bandeja de entrada y auditoría central.
- Política CSP, límites de tamaño y validación estructural de JSON, GeoJSON y XLSX.

## Límites y operación

Una persona con control completo del dispositivo todavía puede alterar su almacenamiento o el código instalado, pero no puede escribir en la base central sin un token activo. La revocación central se aplica en el siguiente contacto; un equipo sin conexión puede seguir capturando localmente, pero no consolidar datos revocados.

Apps Script se ejecuta con la cuenta propietaria y sus cuotas. Los tokens no deben guardarse en el repositorio ni compartirse entre evaluadores. El libro de control debe mantenerse privado y la PWA solo debe aceptar perfiles individuales. La URL pública del web app no reemplaza la autenticación del dispositivo.

La primera firma administrativa aceptada usa confianza inicial (TOFU). Su huella debe compararse por un canal administrativo independiente antes de distribuir paquetes.

La auditoría bloquea vulnerabilidades altas o críticas en dependencias que se distribuyen. `@capacitor/assets` 3.0.5 —la versión más reciente publicada— mantiene avisos en herramientas de generación de imágenes que no forman parte de la PWA ni del APK resultante. CI los informa por separado y no ejecuta ese generador con código de pull requests; deben revisarse cuando el proveedor publique una actualización.
