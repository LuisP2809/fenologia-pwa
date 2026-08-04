# Fenología PWA · versión 0.1

Prototipo funcional offline-first creado a partir del archivo `FENOLOGIA.xlsx` y de las decisiones aprobadas para los roles Evaluador, Supervisor y Administrador.

## Incluye

- PWA instalable con `manifest` y `service worker`.
- Funcionamiento sin conexión después de la primera carga.
- Inicio de sesión local por nombre y DNI/PIN.
- DNI guardado como hash en la base local de demostración.
- Roles: Evaluador, Supervisor y Administrador.
- 255 lotes importados desde el Excel.
- Filtros dependientes: Campo → Fundo → Módulo → Turno-Lote.
- Catálogo de variedades editable por el administrador.
- Asignación y retiro de variedades por lote sin modificar código; los históricos se conservan.
- Cuadrantes Norte, Sur, Este y Oeste.
- Contador de planta reiniciado por fecha + evaluador + lote + variedad + cuadrante.
- Registro de enteros positivos y cero.
- 17 estadios fenológicos y secciones complementarias.
- Biometría normalizada para 35 frutos con D.L, D.EA y D.EB.
- Guardado local en IndexedDB.
- Exportación CSV compatible con Excel:
  - Fenología: 44 columnas.
  - Biometría: 124 columnas.
- Respaldo JSON y limpieza protegida.
- Pantalla preparada para integrar GeoJSON con clave `LOTE`.

## Usuarios de demostración

| Rol | Nombre | DNI/PIN |
|---|---|---|
| Administrador | Administrador Demo | 12345678 |
| Supervisor | Supervisor Demo | 11223344 |
| Evaluador | Evaluador Demo | 87654321 |

## Cómo abrirlo

La PWA debe abrirse desde un servidor web; no directamente con doble clic en `index.html`.

### Opción rápida con Python

```bash
python -m http.server 8080
```

Después abre `http://localhost:8080`.

## Alcance de esta versión

Esta versión valida la estructura local, los filtros, el formulario, los roles, la asignación de variedades por lote y los formatos de salida. Los cambios administrativos se guardan en el dispositivo actual; la sincronización entre dispositivos se incorporará en la versión conectada. Todavía no incluye servidor de sincronización, importación real de archivos XLSX, consolidación multiusuario, gráficos definitivos ni renderizado del GeoJSON.
