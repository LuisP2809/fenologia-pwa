#!/usr/bin/env bash
set -euo pipefail

REPOSITORY="${GITHUB_REPOSITORY:-LuisP2809/fenologia-pwa}"
ALIAS="fenologia_release"
BACKUP_DIR="${HOME}/fenologia-firma-oficial"
KEYSTORE_PATH="${BACKUP_DIR}/fenologia-release.jks"
FINGERPRINT_PATH="${BACKUP_DIR}/certificado-sha256.txt"

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Falta el comando requerido: $1" >&2
    exit 1
  }
}

require_command keytool
require_command gh
require_command base64

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI no tiene una sesión activa. Ejecuta: gh auth login" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

if [[ -e "$KEYSTORE_PATH" ]]; then
  echo "Ya existe una clave en: $KEYSTORE_PATH" >&2
  echo "No se sobrescribirá. Conserva esa clave para todas las versiones futuras." >&2
  exit 1
fi

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

chmod 600 "$KEYSTORE_PATH"

CERT_SHA256="$(keytool -list -v \
  -keystore "$KEYSTORE_PATH" \
  -storepass "$STORE_PASSWORD" \
  -alias "$ALIAS" \
  | awk -F': ' '/SHA256:/{print toupper($2); exit}' \
  | tr -d ':[:space:]')"

if [[ -z "$CERT_SHA256" ]]; then
  echo "No se pudo obtener la huella SHA-256 del certificado." >&2
  exit 1
fi

if base64 --help 2>&1 | grep -q -- '-w'; then
  KEYSTORE_BASE64="$(base64 -w 0 "$KEYSTORE_PATH")"
else
  KEYSTORE_BASE64="$(base64 "$KEYSTORE_PATH" | tr -d '\n')"
fi

printf '%s' "$KEYSTORE_BASE64" | gh secret set ANDROID_KEYSTORE_BASE64 --repo "$REPOSITORY"
printf '%s' "$STORE_PASSWORD" | gh secret set ANDROID_KEYSTORE_PASSWORD --repo "$REPOSITORY"
printf '%s' "$CERT_SHA256" | gh secret set ANDROID_CERT_SHA256 --repo "$REPOSITORY"

printf '%s\n' "$CERT_SHA256" > "$FINGERPRINT_PATH"
chmod 600 "$FINGERPRINT_PATH"

unset KEYSTORE_BASE64 STORE_PASSWORD

echo
echo "Firma permanente configurada en GitHub para: $REPOSITORY"
echo "Alias fijo: $ALIAS"
echo "Huella SHA-256: $CERT_SHA256"
echo
echo "RESPALDO OBLIGATORIO:"
echo "  $KEYSTORE_PATH"
echo "  $FINGERPRINT_PATH"
echo
echo "Descarga esos dos archivos y guarda la contraseña en un administrador de contraseñas."
echo "GitHub no permite recuperar el valor de los secretos después de guardarlos."
echo
echo "Para solicitar el primer APK release:"
echo "  npm run android:release:trigger"
echo "  git add android-release-trigger.txt"
echo "  git commit -m \"build: generar Android release firmado\""
echo "  git push"
