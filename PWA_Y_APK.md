# Fenología — PWA y APK

## PWA 0.14.0

Antes de publicar:

```bash
npm ci
npm test
npm run build:web
```

Sirve `www/` mediante HTTPS y comprueba instalación, primera carga, reinicio sin conexión, persistencia de una evaluación, respaldo y recuperación interna. GitHub Pages publica únicamente desde `main`, ramas `release/**` o una ejecución manual autorizada.

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
