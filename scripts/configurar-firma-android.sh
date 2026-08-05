#!/usr/bin/env bash
set -euo pipefail

REPOSITORY="${GITHUB_REPOSITORY:-LuisP2809/fenologia-pwa}"
ALIAS="fenologia_release"
BACKUP_DIR="${HOME}/fenologia-firma-oficial"
WORKSPACE_DIR="${GITHUB_WORKSPACE:-$(pwd)}"
DOWNLOAD_DIR="${WORKSPACE_DIR}/.private-signing-backup"
KEYSTORE_PATH="${BACKUP_DIR}/fenologia-release.jks"
FINGERPRINT_PATH="${BACKUP_DIR}/certificado-sha256.txt"
BASE64_PATH="${DOWNLOAD_DIR}/ANDROID_KEYSTORE_BASE64.txt"
MANUAL_FINGERPRINT_PATH="${DOWNLOAD_DIR}/ANDROID_CERT_SHA256.txt"
INSTRUCTIONS_PATH="${DOWNLOAD_DIR}/INSTRUCCIONES_SECRETOS.txt"

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Falta el comando requerido: $1" >&2
    exit 1
  }
}

require_command keytool
require_command base64

mkdir -p "$BACKUP_DIR" "$DOWNLOAD_DIR"
chmod 700 "$BACKUP_DIR" "$DOWNLOAD_DIR"

CREATED_NEW_KEY=false
if [[ -e "$KEYSTORE_PATH" ]]; then
  echo "Se encontró la clave permanente existente:"
  echo "  $KEYSTORE_PATH"
  echo "Se reutilizará; no se creará ni sobrescribirá otra clave."
  echo
  printf 'Ingresa la contraseña de esa clave para validarla: '
  IFS= read -r -s STORE_PASSWORD
  printf '\n'
else
  CREATED_NEW_KEY=true
  printf 'Crea una contraseña fuerte para la firma (mínimo 12 caracteres): '
  IFS= read -r -s STORE_PASSWORD
  printf '\nRepite la contraseña: '
  IFS= read -r -s STORE_PASSWORD_CONFIRM
  printf '\n'

  if [[ ${#STORE_PASSWORD} -lt 12 ]]; then
    echo "La contraseña debe tener al menos 12 caracteres." >&2
    exit 1
  fi
  if [[ "$STORE_PASSWORD" != "$STORE_PASSWORD_CONFIRM" ]]; then
    echo "Las contraseñas no coinciden." >&2
    exit 1
  fi
  unset STORE_PASSWORD_CONFIRM

  keytool -genkeypair \
    -keystore "$KEYSTORE_PATH" \
    -storetype JKS \
    -storepass "$STORE_PASSWORD" \
    -keypass "$STORE_PASSWORD" \
    -alias "$ALIAS" \
    -keyalg RSA \
    -keysize 4096 \
    -validity 10000 \
    -dname "CN=Fenologia, OU=Evaluaciones Agricolas, O=Fenologia, L=Chiclayo, ST=Lambayeque, C=PE" \
    -noprompt
fi

chmod 600 "$KEYSTORE_PATH"

KEY_INFO="$(keytool -list -v \
  -keystore "$KEYSTORE_PATH" \
  -storepass "$STORE_PASSWORD" \
  -alias "$ALIAS" 2>/dev/null)" || {
  unset STORE_PASSWORD
  echo "La contraseña no coincide o la clave no contiene el alias $ALIAS." >&2
  echo "No se modificó la clave existente." >&2
  exit 1
}

CERT_SHA256="$(printf '%s\n' "$KEY_INFO" \
  | awk -F': ' '/SHA256:/{print toupper($2); exit}' \
  | tr -d ':[:space:]')"
unset KEY_INFO

if [[ -z "$CERT_SHA256" ]]; then
  unset STORE_PASSWORD
  echo "No se pudo obtener la huella SHA-256 del certificado." >&2
  exit 1
fi

if base64 --help 2>&1 | grep -q -- '-w'; then
  base64 -w 0 "$KEYSTORE_PATH" > "$BASE64_PATH"
else
  base64 "$KEYSTORE_PATH" | tr -d '\n' > "$BASE64_PATH"
fi

printf '%s\n' "$CERT_SHA256" > "$FINGERPRINT_PATH"
printf '%s\n' "$CERT_SHA256" > "$MANUAL_FINGERPRINT_PATH"
cp "$KEYSTORE_PATH" "$DOWNLOAD_DIR/fenologia-release.jks"
cp "$FINGERPRINT_PATH" "$DOWNLOAD_DIR/certificado-sha256.txt"

cat > "$INSTRUCTIONS_PATH" <<EOF
SECRETOS REQUERIDOS EN GITHUB ACTIONS
Repositorio: $REPOSITORY

1. ANDROID_KEYSTORE_BASE64
   Copiar todo el contenido de: .private-signing-backup/ANDROID_KEYSTORE_BASE64.txt

2. ANDROID_KEYSTORE_PASSWORD
   Escribir la contraseña privada de la firma. Esta contraseña NO está guardada en archivos.

3. ANDROID_CERT_SHA256
   Copiar todo el contenido de: .private-signing-backup/ANDROID_CERT_SHA256.txt

Ruta en GitHub:
Settings > Secrets and variables > Actions > New repository secret

No subir la carpeta .private-signing-backup al repositorio y no compartir sus archivos por chat.
EOF

chmod 600 \
  "$FINGERPRINT_PATH" \
  "$BASE64_PATH" \
  "$MANUAL_FINGERPRINT_PATH" \
  "$INSTRUCTIONS_PATH" \
  "$DOWNLOAD_DIR/fenologia-release.jks" \
  "$DOWNLOAD_DIR/certificado-sha256.txt"

AUTO_UPLOAD_OK=false
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  echo
  echo "Intentando guardar los secretos automáticamente en GitHub…"
  set +e
  printf '%s' "$(cat "$BASE64_PATH")" | gh secret set ANDROID_KEYSTORE_BASE64 --repo "$REPOSITORY"
  STATUS_BASE64=$?
  printf '%s' "$STORE_PASSWORD" | gh secret set ANDROID_KEYSTORE_PASSWORD --repo "$REPOSITORY"
  STATUS_PASSWORD=$?
  printf '%s' "$CERT_SHA256" | gh secret set ANDROID_CERT_SHA256 --repo "$REPOSITORY"
  STATUS_CERT=$?
  set -e

  if [[ $STATUS_BASE64 -eq 0 && $STATUS_PASSWORD -eq 0 && $STATUS_CERT -eq 0 ]]; then
    AUTO_UPLOAD_OK=true
  fi
fi

unset STORE_PASSWORD

echo
echo "Clave permanente validada correctamente."
if [[ "$CREATED_NEW_KEY" == true ]]; then
  echo "Se creó una nueva clave oficial."
else
  echo "Se conservó y reutilizó la clave oficial existente."
fi
echo "Alias fijo: $ALIAS"
echo "Huella SHA-256: $CERT_SHA256"
echo
echo "RESPALDO OBLIGATORIO:"
echo "  $KEYSTORE_PATH"
echo "  $FINGERPRINT_PATH"
echo
echo "COPIAS SEGURAS PARA DESCARGAR DESDE CODESPACES:"
echo "  $DOWNLOAD_DIR/fenologia-release.jks"
echo "  $DOWNLOAD_DIR/certificado-sha256.txt"

if [[ "$AUTO_UPLOAD_OK" == true ]]; then
  echo
echo "Los tres secretos se guardaron automáticamente en GitHub Actions."
else
  echo
echo "GitHub no permitió guardar los secretos automáticamente con el token de Codespaces."
  echo "La clave NO se perdió. Los valores manuales quedaron preparados en:"
  echo "  $BASE64_PATH"
  echo "  $MANUAL_FINGERPRINT_PATH"
  echo "  $INSTRUCTIONS_PATH"
  echo
echo "Crea manualmente estos secretos en:"
  echo "  Settings > Secrets and variables > Actions"
  echo "  ANDROID_KEYSTORE_BASE64"
  echo "  ANDROID_KEYSTORE_PASSWORD"
  echo "  ANDROID_CERT_SHA256"
fi

echo
echo "La carpeta .private-signing-backup está ignorada por Git."
echo "Descarga la clave y conserva la contraseña en un administrador de contraseñas."
echo "No compartas el archivo .jks, su Base64 ni la contraseña por chat."
echo
echo "Después de configurar los tres secretos, solicita el APK release con:"
echo "  npm run android:release:trigger"
echo "  git add android-release-trigger.txt"
echo "  git commit -m \"build: generar Android release firmado\""
echo "  git push"
