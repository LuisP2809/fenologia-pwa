# Modelo de seguridad local

Fenología 0.14.0 es una aplicación *offline-first*. Protege los datos frente a errores operativos y modificaciones accidentales, pero un dispositivo controlado por un atacante no equivale a un servidor confiable.

## Controles implementados

- Credenciales derivadas con PBKDF2-SHA-256 y migración automática de hashes antiguos.
- Bloqueo temporal tras intentos fallidos y sesiones con expiración e inactividad máxima.
- Paquetes de configuración y perfiles de limpieza firmados con ECDSA P-256.
- Vinculación de la primera identidad firmante y rechazo de cambios posteriores no autorizados.
- Perfiles de limpieza con revisión, vencimiento y protección básica frente a retroceso del reloj.
- Copia interna verificada antes de permitir una limpieza, además del archivo externo cuando el sistema confirma su persistencia.
- Política CSP, límites de tamaño y validación estructural de JSON, GeoJSON y XLSX.

## Límites que requieren infraestructura

Los roles, la revocación inmediata, la auditoría central y la sincronización entre dispositivos no pueden imponerse de manera absoluta solo con JavaScript local. Una persona con control completo del dispositivo puede alterar su almacenamiento o el código instalado. Para un entorno de alta confianza se requiere una API autenticada, claves administradas fuera del dispositivo, autorización en servidor, registro de auditoría remoto y administración empresarial del APK.

La primera firma aceptada usa confianza inicial (TOFU). Su huella debe compararse por un canal administrativo independiente antes de distribuir paquetes a producción.
