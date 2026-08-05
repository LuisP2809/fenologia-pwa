# Fenología — PWA y APK

## PWA

La aplicación se instala desde un navegador compatible mediante el botón **Instalar** que aparece en Fenología.

### Prueba local

```bash
python3 -m http.server 8028 --bind 0.0.0.0
```

Abrir el puerto `8028`, esperar la carga completa y comprobar:

1. Versión `0.12.0`.
2. Botón **Instalar** en navegador.
3. Funcionamiento sin conexión después de la primera carga.
4. Conservación de evaluaciones tras cerrar y volver a abrir.
5. Aviso **Actualizar ahora** cuando exista una versión nueva.

## APK Android

Fenología utiliza Capacitor para empaquetar los mismos archivos de la PWA dentro de Android.

### Requisitos locales

- Node.js 22 o superior.
- Java 21.
- Android Studio con Android SDK, únicamente para construcción local.

### Crear Android por primera vez

```bash
npm install
npm run verify:pwa
npm run android:init
npx @capacitor/assets generate --android --assetPath assets --iconBackgroundColor '#07552F' --splashBackgroundColor '#F3F7F2'
npx cap sync android
npm run apk:debug
```

El APK de prueba queda en:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

### Actualizar Android después de cambiar la aplicación

```bash
npm run android:sync
npm run apk:debug
```

## Construcción automática en GitHub

El flujo **Construir APK Android** genera automáticamente un APK cuando se actualiza la rama `agent/version-inicial-pwa` o cuando se ejecuta manualmente.

El resultado aparece como artefacto con el nombre:

```text
Fenologia-APK-0.12.0
```

Incluye:

- `Fenologia-0.12.0-debug.apk`
- `Fenologia-0.12.0-debug.sha256`

## Antes de publicar formalmente

El identificador Android actual es:

```text
pe.fenologia.campo
```

Debe confirmarse antes de publicar en una tienda, porque después de la primera publicación no conviene cambiarlo.

La versión `debug` sirve para pruebas internas. Para distribución formal se deberá:

1. Crear un almacén de firma privado.
2. Configurar secretos de firma en GitHub.
3. Generar un APK o AAB de lanzamiento.
4. Definir política de privacidad y ficha de la aplicación.
5. Probar instalación, actualización, exportación, importación y trabajo offline en dispositivos reales.
