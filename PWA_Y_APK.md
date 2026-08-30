# Fenología — PWA y APK

## PWA 0.20.0

Antes de publicar:

```bash
npm ci
npm test
npm run build:web
```

Sirve `www/` mediante HTTPS y comprueba instalación, primera carga, reinicio sin conexión, persistencia, cola pendiente y confirmación central. La prueba automatizada incluye 2,400 evaluaciones semanales y reenvíos idempotentes. GitHub Pages publica únicamente desde `main`, ramas `release/**` o una ejecución manual autorizada.

0.20.0 reemplaza la creación de usuarios mediante modal por una pantalla directa equivalente a Fitosanidad. Apps Script crea el usuario y devuelve su QR, enlace y código temporal en una sola operación. `ADM-001` y el reinicio único realizado por 0.18.0 se conservan.

En 0.17.0 el mapa y los gráficos del Supervisor/Administrador consultan la semana confirmada en línea al abrirse y durante la actualización periódica. Los Excel históricos cargados se combinan por UUID, sin reemplazar la base local. El Administrador publica automáticamente una configuración operativa sin credenciales para mantener catálogos, variedades, asignaciones, campañas, roles y estados de usuario al día.

Para una prueba real actualiza primero Apps Script, ejecuta `setupFenologia()` y después `prepareInitialAdmin()`. Usa el código mostrado una sola vez para crear `ADM-001`; los demás dispositivos se activan con el QR o código generado desde **Usuarios y roles**. No uses datos productivos hasta validar un ciclo completo de activación, catálogo, captura, desconexión, reconexión, desactivación, archivo semanal, mapa, gráfico y limpieza.

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
