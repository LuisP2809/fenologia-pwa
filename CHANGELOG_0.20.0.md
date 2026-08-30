# Fenología 0.20.0

## Administrador en varios dispositivos

- `ADM-001` puede mantener activa su PC y agregar uno o más celulares mediante QR, enlace o código temporal.
- Cada dispositivo recibe una credencial central independiente y conserva su propio PIN local.
- Activar un celular ya no rota ni invalida la credencial de la PC principal.
- La pantalla inicial consulta si el Administrador ya existe y evita mostrar nuevamente el formulario de creación.
- El Administrador puede listar, revocar o reactivar dispositivos individualmente sin borrar evaluaciones.
- La credencial 0.19.0 de la PC se migra automáticamente en su primera conexión con el servicio 0.20.0.

## Compatibilidad

- Se conservan usuarios, catálogos, evaluaciones, cola offline y configuración central.
- Los perfiles 0.18.0 y 0.19.0 continúan siendo aceptados durante la migración.
- La actualización requiere desplegar Apps Script 0.20.0 antes de publicar la PWA 0.20.0.
