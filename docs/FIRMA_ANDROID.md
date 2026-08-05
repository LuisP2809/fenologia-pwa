# Firma permanente de Fenología para Android

Este procedimiento se realiza una sola vez antes de comenzar a usar datos reales.

## Objetivo

Todas las versiones oficiales conservarán:

- Identificador: `pe.fenologia.campo`
- Alias de firma: `fenologia_release`
- La misma clave privada `.jks`
- Un `versionCode` siempre superior al anterior

Con estas condiciones, Android podrá instalar una versión nueva encima de la anterior sin eliminar IndexedDB, configuraciones ni evaluaciones locales.

## 1. Crear la clave y los secretos

En GitHub Codespaces, desde la raíz del repositorio:

```bash
npm run android:signing:setup
```

El asistente solicitará una contraseña de al menos 12 caracteres. No se mostrará mientras se escribe.

Creará y configurará estos secretos del repositorio:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_CERT_SHA256`

La clave no se sube al repositorio.

## 2. Respaldo obligatorio

El asistente dejará dos archivos en:

```text
~/fenologia-firma-oficial/
```

- `fenologia-release.jks`
- `certificado-sha256.txt`

Descarga ambos desde el explorador de archivos de Codespaces y guarda la contraseña en un administrador de contraseñas.

No dependas únicamente de GitHub Secrets: sus valores no pueden recuperarse después de guardarlos. Si se pierde la clave privada, no se podrán firmar actualizaciones compatibles con la aplicación ya instalada.

Nunca subas al repositorio archivos `.jks`, `.keystore`, contraseñas o contenido Base64 de la clave.

## 3. Generar el primer release oficial

```bash
npm run android:release:trigger
git add android-release-trigger.txt
git commit -m "build: generar Android release firmado"
git push
```

Esto inicia el workflow **Construir Android Release Firmado**.

El artefacto descargable contendrá:

- `Fenologia-0.12.1-release.apk`
- `Fenologia-0.12.1-release.aab`
- `SHA256SUMS.txt`
- `INFORMACION_DE_FIRMA.txt`

## 4. Primera instalación

El primer APK release tiene una firma diferente del APK debug. Por eso puede requerir una última desinstalación del APK de pruebas.

Antes de desinstalar una versión que contenga datos reales, exporta los CSV y crea un respaldo JSON.

Después de instalar el primer APK release, todas las versiones futuras deberán usar esta misma clave.

## 5. Publicar una versión nueva

Actualiza `android-release.json`:

```json
{
  "applicationId": "pe.fenologia.campo",
  "versionName": "0.12.2",
  "versionCode": 1202
}
```

Reglas:

- No cambiar `applicationId`.
- Incrementar siempre `versionCode`.
- No reutilizar un `versionCode` anterior.
- Mantener los mismos secretos de firma.

Luego ejecuta nuevamente el disparador de release.

## 6. Verificación automática

El workflow:

1. Construye APK y AAB release.
2. Firma ambos con la clave oficial.
3. Verifica criptográficamente el APK y el AAB.
4. Compara la huella del certificado con `ANDROID_CERT_SHA256`.
5. Detiene la publicación si la firma no coincide.

Esto evita publicar accidentalmente una versión firmada con otra clave.
