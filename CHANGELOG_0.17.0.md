# Datos en línea y configuración central · 0.17.0

## Mejoras

- El mapa y los gráficos de Supervisor y Administrador usan las evaluaciones confirmadas de la semana activa sin esperar una consolidación manual.
- Al abrir mapa o gráficos se solicita una actualización; también se renuevan durante el intervalo configurado.
- Los archivos Excel históricos se suman a la fuente en línea y los UUID repetidos se deduplican.
- Catálogos, variedades, asignaciones, campañas, roles y usuarios activos se publican como configuración central.
- Los dispositivos aplican la revisión central en su siguiente sincronización y conservan únicamente su credencial local.
- Desactivar un usuario también lo inhabilita en Apps Script; en el siguiente contacto se cierra su sesión sin borrar evaluaciones locales.
- Los conflictos entre dos Administradores con la misma revisión se bloquean para revisión.

## Compatibilidad y seguridad

- Los perfiles individuales 0.16.0 siguen funcionando; no deben regenerarse para esta actualización.
- La configuración central nunca incluye PIN/DNI, hashes de acceso, sales criptográficas ni tokens.
- Se mantiene el guardado *offline-first*: un problema de red no impide guardar una evaluación local.
- El inicio limpio de 0.16.0 no se repite y no se elimina información al instalar 0.17.0.

## Despliegue

Esta versión permanece en prueba hasta contar con aprobación explícita. Para activarla hacen falta dos pasos separados: publicar la PWA y actualizar la implementación existente de Google Apps Script después de ejecutar `setupFenologia()`.
