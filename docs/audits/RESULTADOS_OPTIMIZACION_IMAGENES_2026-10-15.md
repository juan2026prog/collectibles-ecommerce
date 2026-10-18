# Resultados de optimización de imágenes — 15 de octubre de 2026

Código publicado: `80a640366da13f4f281c3b33a994b9969ff05e5e`.
Vercel: `dpl_5HtrRRp7wRNLn8HG856zexmbfNSm`, READY y asociado a collectibles.uy.

## Mediciones verificadas

| Recurso | Antes | Después | Reducción |
|---|---:|---:|---:|
| Fotos de los mismos 15 productos, tarjeta de 320 px | 4.405.943 B | 253.378 B | 94,25% |
| Fotos de los mismos 15 productos, tarjeta de 640 px | 4.405.943 B | 679.424 B | 84,58% |
| Foto principal Minecraft: original → tarjeta 320 | 136.848 B | 19.786 B | 85,54% |
| Insignia transparente → miniatura 160 | 205.154 B | 12.028 B | 94,14% |
| Galería Minecraft sin zoom, escenario detalle 960 + siete miniaturas 160 | 5.023.918 B | 115.556 B | 97,70% |
| JavaScript inicial, descomprimido | 5.311.803 B | 958.463 B publicados | 81,96% |
| Metadatos de caché mal formados | 44 | 0 | 44 reparados |

El peso de imágenes corresponde a recursos de la misma página, no al tiempo de carga ni a todas las descargas simultáneas: las imágenes fuera de pantalla siguen usando carga diferida. El navegador selecciona resolución según tamaño y DPR; 320 y 640 son escenarios diferentes. No se midieron Core Web Vitals representativos ni tráfico de pico.

## Cambios aplicados

- Selección compartida de imagen: `is_primary`, `sort_order`/`position` con cero válido y desempate estable; deduplicación y candidatos alternativos.
- Variantes persistentes WebP de 160, 320, 640 y 960 píxeles de ancho, sin ampliar fuentes pequeñas. Originales y URLs comerciales conservados.
- Registro `media_image_variants`, lectura pública por lotes y escritura restringida por RLS a administradores o propietarios del objeto. RPC de lectura con SECURITY INVOKER. Verificado que anónimos no tienen INSERT/TRUNCATE y usuarios autenticados tampoco TRUNCATE.
- `srcSet`, `sizes`, dimensiones, decodificación asíncrona y prioridad por posición real; imagen principal de detalle con prioridad alta y original disponible al activar zoom.
- Miniaturas de galería e insignias usan versiones pequeñas. Componentes compartidos de Toast/ConfirmModal separados del administrador.
- Pantallas de administración y portales divididas por rutas; HTML y grafo de importaciones verificados sin módulos de rutas privadas en la carga inicial. Los 26 módulos iniciales publicados respondieron 200.
- Cargas de MediaPicker, biblioteca, categorías, banners, insignias y bibliotecas de vendedores generan variantes conservando el archivo recibido. SVG/GIF y WebP animado se conservan sin rasterizar.
- Reparación de 44 encabezados mediante la API soportada de Storage. Comprobados bytes idénticos, Content-Type, ETag y posterior propagación HTTP de `max-age=3600`. Caché anual reservada para nuevas variantes con ruta versionada por hash.

## Piloto y migración gradual

Piloto representativo de ocho imágenes: PNG pesado, WebP existente, JPEG pequeño, imagen grande, galería e insignia con transparencia. Comparación visual de originales y variantes satisfactoria en los tamaños examinados. Pruebas locales adicionales de fuente 80×60 y GIF animado confirmaron ausencia de ampliación y preservación de animación.

Un segundo lote de veinte imágenes completó las principales de los primeros quince productos y varias galerías. Total: **28 imágenes registradas**, sin errores de migración. No se convirtió el catálogo completo, conforme al prompt.

Los originales de esas 28 imágenes suman 9.861.614 B; sus variantes de tarjeta suman 431.308 B. Este total incluye recursos adicionales a los quince productos y no debe confundirse con la medición de una página.

Comandos para lotes siguientes, ejecutados desde la raíz y con credenciales exclusivamente locales:

```powershell
# Sin --apply solo lista el plan. Límite obligatorio: 1..50; el predeterminado es 8.
node scripts/migrate_image_variants.mjs --manifest <manifest-de-URLs-publicas.json> --limit 20 --python <python-con-Pillow>
node scripts/migrate_image_variants.mjs --manifest <manifest-de-URLs-publicas.json> --limit 20 --apply --python <python-con-Pillow>
```

La migración omite fuentes ya registradas y no sobrescribe variantes. El diario reanudable guarda original, hash, variantes, dimensiones, tamaños, ahorro, estado y error en `docs/audits/monitoring/image-variants-migration.jsonl`, ignorado por Git. Los archivos intermedios quedan en la caché local.

## Validación y límites

- 37 pruebas específicas, cinco suites: correctas.
- Build habitual y build aislado sin los cambios ajenos de mercados: correctos.
- Revisión de grafo estático y ausencia de claves service role en los bundles: correctas.
- Una ejecución amplia de pruebas se interrumpió al incluir pruebas antiguas que acceden a servicios reales y casos ajenos de mercados; no se declara que toda la suite histórica pase.
- Commit y push a `origin/main` completados. El trabajo ajeno de mercados quedó sin stagear.
- HTML oficial de inicio y tienda: HTTP 200. A las 05:11 UTC, el API del catálogo seguía devolviendo 503 por tiempos de conexión de Supabase, también observados en el despliegue anterior desde aproximadamente las 05:00 UTC. Esto impidió entonces completar la comprobación visual de las tarjetas en producción.

## Incidencia de base de datos durante la verificación

Vercel confirmó fallos de transporte/TimeoutError en el despliegue anterior `9d41e8d`, antes de publicar este código. El conector SQL de Supabase también agotó conexiones; una muestra exitosa de las 05:08:50 UTC indicó 23/60 conexiones, 1 activa, 0 esperas de bloqueo y 4 transacciones inactivas abiertas. Los logs muestran seis cancelaciones PostgreSQL `57014` en SELECT/PARSE/BIND de PostgREST alrededor de las 05:00–05:01 UTC. No se obtuvo evidencia suficiente para atribuir el problema a CPU, RAM, IOPS, saturación de conexiones ni a una consulta determinada.

El usuario autorizó expresamente un reinicio controlado. Supabase rechazó el intento de pausa/reactivación con `Failed to verify backup status before pausing`; el proyecto no llegó a pausarse. El conector no expone reinicio directo. Se abrió el panel oficial, pero requiere iniciar sesión para usar su botón de reinicio. Ese acceso se completó posteriormente y permitió realizar el reinicio directo y las comprobaciones descritas abajo. Un reinicio por sí solo no demuestra que la causa de las trabas haya quedado corregida.


### Reinicio directo autorizado

El 15 de octubre, a las 05:23 UTC (02:23 de Uruguay), el usuario completó el acceso al panel y se confirmó el reinicio directo del mismo proyecto. El panel mostró Restarting y el conector confirmó RESTARTING. Se verificará la recuperación antes de declarar que el catálogo funciona.


### Recuperación confirmada y medición final en producción

A las 05:30:32 UTC PostgreSQL respondió con 121 segundos de actividad desde su arranque, 18/60 conexiones, cero bloqueos, cero consultas activas largas y cero transacciones inactivas abiertas. El catálogo recuperó HTTP 200 con 1.205 productos; la búsqueda de Pokémon respondió 200 con 127 resultados. La primera lectura del catálogo después del reinicio tardó 9.293 ms. Una comprobación posterior, a las 05:32:55 UTC, obtuvo inicio 200 en 1.219 ms, tienda 200 en 196 ms, catálogo 200 en 106 ms y búsqueda 200 en 98 ms; las dos últimas fueron respuestas de caché STALE. Estos tiempos no constituyen una medición de carga completa ni una prueba de pico.

La comparación de imágenes se refinó con las fotos principales realmente seleccionadas por el catálogo publicado: las quince cuentan con variantes, suman 253.378 B a 320 px y 679.424 B a 640 px. El total anterior de 260.304 B era una estimación conservadora realizada antes de recuperar el API.

Se comprobó en el navegador que las quince tarjetas usan rutas versionadas de variantes, están decodificadas y mantienen la principal correcta. En la vista de escritorio examinada, la primera fila tuvo eager/auto y las filas inferiores lazy/low. En el detalle de Minecraft se comprobó la variante de detalle, las siete miniaturas y el cambio a la segunda foto. El zoom conserva el original.

Los fallos de cron de la muestra incluyen la incidencia previa y la ventana del reinicio; no deben atribuirse todos a la intervención ni confundirse con resultados HTTP de los workers. El monitoreo de estabilidad continúa: este reinicio recuperó el servicio, pero no demuestra por sí solo una corrección permanente de la causa de las trabas.


Validación móvil final: viewport CSS de 380×844, quince tarjetas visibles en el diseño, quince fotos cargadas y quince URLs de variantes. Cuatro fotos sobre el pliegue con eager/auto; las once inferiores con lazy/low. Se verificó una recarga nueva para evitar confundir las prioridades con una restauración de scroll. Se restauró el tamaño normal del navegador al terminar.
