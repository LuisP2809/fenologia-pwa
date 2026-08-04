# Fenología PWA · versión visual 0.2

PWA offline-first creada a partir de `FENOLOGIA.xlsx` y de los visualizadores aprobados para los roles Evaluador, Supervisor y Administrador.

## Qué incorpora esta versión

- Inicio de sesión con una presentación visual renovada.
- Panel principal diferente según el rol.
- Menú del evaluador con Registro, Detalle y Gestión de datos.
- Formulario organizado mediante secciones desplegables para no saturar la pantalla.
- Filtros dependientes Campo → Fundo → Módulo → Turno-Lote → Variedad.
- Contador de planta por fecha, evaluador, lote, variedad y cuadrante.
- Registro de los 17 estadios fenológicos.
- Secciones de evolución de yemas, senescencia, brotamiento, floración, cuaja, panícula, biometría y caída de fruta.
- Biometría de 35 frutos con D.L, D.EA y D.EB.
- Detalle de registros guardados localmente.
- Exportaciones de Fenología y Biometría con estructuras de 44 y 124 columnas.
- Panel del supervisor con consolidación, resumen, mapa y gráficos visuales de muestra.
- Panel administrativo para usuarios, catálogos y variedades por lote.
- Variedades activables o desactivables por lote sin modificar código.
- Funcionamiento offline mediante service worker y almacenamiento local.

## Usuarios de demostración

| Rol | Nombre | DNI/PIN |
|---|---|---|
| Administrador | Administrador Demo | 12345678 |
| Supervisor | Supervisor Demo | 11223344 |
| Evaluador | Evaluador Demo | 87654321 |

## Vista previa en Codespaces

La rama de revisión es:

```text
agent/version-inicial-pwa
```

El Codespace abre automáticamente el puerto 8000. Después de traer cambios con `git pull`, abre la pestaña **Puertos** y usa el enlace del puerto 8000.

## Estado del proyecto

Esta versión está orientada a validar diseño, navegación y flujo offline. La importación real de XLSX, consolidación completa, activación de usuarios mediante enlace, sincronización entre dispositivos y renderizado del GeoJSON se implementarán en siguientes iteraciones.
