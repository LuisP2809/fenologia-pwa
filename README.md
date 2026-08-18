# Fenología PWA · 0.14.0

Aplicación *offline-first* para capturar, respaldar, consolidar y analizar evaluaciones fenológicas y biométricas desde los roles Evaluador, Supervisor y Administrador.

## Funciones principales

- Captura continua con guardado confirmado en IndexedDB.
- Cuadrante opcional en captura, edición, exportación e importación XLSX.
- Parámetros oficiales y adicionales guardados de forma atómica.
- Importación XLSX/JSON y GeoJSON con límites y validación estructural.
- Análisis temporal de archivos sin reemplazar la base local.
- Respaldos externos y copia interna verificada recuperable.
- Paquetes administrativos firmados y credenciales derivadas con PBKDF2.
- PWA instalable, funcionamiento sin conexión y APK Android de prueba.

## Desarrollo y validación

Requiere Node.js 22 o superior.

```bash
npm ci
npm test
npm run build:web
```

El resultado web se genera en `www/`. Las cuentas locales de desarrollo solo se crean en `localhost`, `127.0.0.1` o Codespaces; una instalación de producción nueva debe recibir un paquete administrativo firmado.

Consulta [PWA_Y_APK.md](PWA_Y_APK.md) para construcción y [SECURITY_MODEL.md](SECURITY_MODEL.md) para los límites del modelo sin servidor.
