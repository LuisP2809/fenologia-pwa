# Fenología — PWA y APK

## PWA 0.17.0

Antes de publicar:

```bash
npm ci
npm test
npm run build:web
```

Sirve `www/` mediante HTTPS y comprueba instalación, primera carga, reinicio sin conexión, persistencia, cola pendiente y confirmación central. La prueba automatizada incluye 2,400 evaluaciones semanales y reenvíos idempotentes. GitHub Pages publica únicamente desde `main`, ramas `release/**` o una ejecución manual autorizada.

El inicio limpio introducido en 0.16.0 conserva su marcador y no vuelve a ejecutarse al actualizar a 0.17.0. La actualización no elimina registros, accesos, perfiles ni libros de Drive. Los perfiles de sincronización 0.16.0 ya instalados siguen siendo compatibles.

En 0.17.0 el mapa y los gráficos del Supervisor/Administrador consultan la semana confirmada en línea al abrirse y durante la actualización periódica. Los Excel históricos cargados se combinan por UUID, sin reemplazar la base local. El Administrador publica automáticamente una configuración operativa sin credenciales para mantener catálogos, variedades, asignaciones, campañas, roles y estados de usuario al día.

La PWA funciona sin desplegar el backend, pero en ese estado conserva los registros como pendientes locales y no puede propagar la configuración. Para una prueba real con Drive, instala por separado el contenido de `apps-script/`, ejecuta `setupFenologia()` después de actualizar el código, registra usuarios de prueba y entrega a cada dispositivo su perfil individual. No uses datos productivos hasta validar un ciclo completo de catálogo, captura, desconexión, reconexión, desactivación, archivo semanal, mapa, gráfico y limpieza.

## APK Android de prueba

Requiere Node.js 22, Java 21 y Android SDK.

```bash
npm ci
npm test
npm run android:init
npx @capacitor/assets generate --android --assetPath assets --iconBackgroundColor '#07552F' --splashBackgroundColor '#F3F7F2'
npx cap sync android
npm run apk:debug
```

El archivo queda en `android/app/build/outputs/apk/debug/app-debug.apk`. Es un artefacto de prueba firmado con la clave de depuración; no debe distribuirse como versión productiva. Una publicación productiva necesita firma de lanzamiento, custodia de claves y un canal administrado.
