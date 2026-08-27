# Fenología PWA · 0.17.0

Aplicación *offline-first* para capturar, respaldar, consolidar y analizar evaluaciones fenológicas y biométricas desde los roles Evaluador, Supervisor y Administrador.

## Funciones principales

- Captura continua con guardado confirmado en IndexedDB y cola offline independiente.
- Cuadrante opcional en captura, edición, exportación e importación XLSX.
- Parámetros oficiales y adicionales guardados de forma atómica.
- Importación XLSX/JSON y GeoJSON con límites y validación estructural.
- Análisis temporal de archivos sin reemplazar la base local.
- Sincronización idempotente con Google Apps Script y Google Sheets nativo.
- Archivos semanales por campaña con Fenología, Biometría, parámetros, metadatos y auditoría.
- Mapa y gráficos del Supervisor/Administrador alimentados por las evaluaciones confirmadas de la semana activa.
- Configuración operativa central para propagar catálogos, asignaciones, campañas, roles y usuarios activos.
- Desactivación central efectiva en el siguiente contacto del dispositivo, sin eliminar sus evaluaciones locales.
- Monitor de equipo, alertas, capacidad de Drive y estado de la revisión de configuración.
- Limpieza automática únicamente después de recibir un recibo central con el mismo hash.
- Apertura de archivos históricos para consultar y graficar semanas anteriores.
- Paquetes administrativos firmados y credenciales derivadas con PBKDF2.
- Inicio limpio guiado: el dispositivo principal crea primero al Administrador y los demás importan accesos nuevos.
- PWA instalable, funcionamiento sin conexión y APK Android de prueba.

## Desarrollo y validación

Requiere Node.js 22 o superior.

```bash
npm ci
npm test
npm run build:web
```

El resultado web se genera en `www/`. Las cuentas locales de desarrollo y el simulador central solo se habilitan en `localhost`, `127.0.0.1` o Codespaces. En una instalación real, el primer dispositivo crea al Administrador principal; después, ese Administrador genera el acceso firmado y el perfil individual de sincronización de cada Evaluador o Supervisor.

El backend instalable está en `apps-script/` y debe desplegarse por separado. Consulta [PWA_Y_APK.md](PWA_Y_APK.md), [SECURITY_MODEL.md](SECURITY_MODEL.md) y [CHANGELOG_0.17.0.md](CHANGELOG_0.17.0.md).
