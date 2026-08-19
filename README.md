# Fenología PWA · 0.15.0 (candidata local)

Aplicación *offline-first* para capturar, respaldar, consolidar y analizar evaluaciones fenológicas y biométricas desde los roles Evaluador, Supervisor y Administrador.

## Funciones principales

- Captura continua con guardado confirmado en IndexedDB y cola offline independiente.
- Cuadrante opcional en captura, edición, exportación e importación XLSX.
- Parámetros oficiales y adicionales guardados de forma atómica.
- Importación XLSX/JSON y GeoJSON con límites y validación estructural.
- Análisis temporal de archivos sin reemplazar la base local.
- Sincronización idempotente con Google Apps Script y Google Sheets nativo.
- Archivos semanales por campaña con Fenología, Biometría, parámetros, metadatos y auditoría.
- Monitor de equipo, alertas, capacidad de Drive y gráficos de la semana activa para el Supervisor.
- Limpieza automática únicamente después de recibir un recibo central con el mismo hash.
- Apertura de archivos históricos para consultar y graficar semanas anteriores.
- Paquetes administrativos firmados y credenciales derivadas con PBKDF2.
- PWA instalable, funcionamiento sin conexión y APK Android de prueba.

## Desarrollo y validación

Requiere Node.js 22 o superior.

```bash
npm ci
npm test
npm run build:web
```

El resultado web se genera en `www/`. Las cuentas locales de desarrollo y el simulador central solo se habilitan en `localhost`, `127.0.0.1` o Codespaces; una instalación real necesita un paquete administrativo firmado y un perfil individual de sincronización.

El backend instalable, pero todavía no desplegado, está en `apps-script/`. Consulta [PWA_Y_APK.md](PWA_Y_APK.md), [SECURITY_MODEL.md](SECURITY_MODEL.md) y [CHANGELOG_0.15.0.md](CHANGELOG_0.15.0.md).
