# Cambios propuestos · 0.15.0

Estado: implementado y probado localmente. No publicado y sin Apps Script desplegado.

## Mejoras

- Guardado local inmediato con cola persistente, reintentos exponenciales y confirmación separada.
- Sincronización de hasta 25 evaluaciones por solicitud mediante perfiles individuales.
- Archivos nativos semanales en Drive, separados por campaña y fecha real de evaluación.
- Hojas oficiales de 44 y 124 columnas, parámetros adicionales, metadatos y auditoría.
- Control de concurrencia para cinco o más evaluadores mediante bloqueo global del servidor.
- Prevención de duplicados por UUID, hash y clave lógica; revisiones válidas conservan el mismo UUID.
- Cuadrante opcional en cliente, importación, exportación y servidor.
- Panel del Evaluador con estados local, pendiente, confirmando, sincronizado, error y conflicto.
- Panel del Supervisor con dispositivos, pendientes conocidos, alertas, archivos semanales, Drive y datos activos para gráficos.
- Caché reemplazable de la semana activa para conservar los últimos gráficos del Supervisor al reiniciar sin conexión.
- Panel del Administrador para conexión, retención y perfiles individuales; se retira del flujo la autorización antigua de limpieza manual.
- Limpieza local automática solo para registros confirmados, con hash coincidente, sin cola y fuera del periodo de retención.
- Los conflictos, pendientes y datos de la semana activa permanecen en el celular.
- Los archivos históricos continúan abriéndose desde la computadora para análisis y gráficos de varias semanas.

## Pruebas locales

- 2,400 evaluaciones: cinco evaluadores, 400 filas diarias durante seis días.
- 480 reenvíos repetidos sin crecimiento del número de UUID.
- Edición correcta, edición basada en una versión obsoleta y UUID diferente con la misma clave lógica.
- Transición de semana/año ISO, cuadrante vacío y columnas oficiales.
- Flujo de cola, recibo, conflicto, limpieza y vistas Evaluador/Supervisor/Administrador con servidor simulado.
- Sintaxis, integridad, criptografía, PWA, GeoJSON y construcción de `www/`.

## Pendiente antes de publicar

- Instalar Apps Script en una cuenta de prueba y crear usuarios/tokens ficticios.
- Probar en dos o más celulares reales la desconexión, concurrencia y reconexión.
- Comparar los libros semanales generados con las plantillas esperadas.
- Validar permisos de Drive, cuotas de Apps Script y alertas después de varias horas.
- Generar y probar el APK 0.15.0 en Android.
- Obtener aprobación explícita para desplegar Apps Script y publicar PWA/APK.
