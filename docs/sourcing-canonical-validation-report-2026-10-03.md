# Sourcing Intelligence — reporte de implementación

Fecha: 2026-10-03. Estado: implementación local validada; entrega en producción pendiente.

## ARCHITECTURE

- canonical validation = `shared/sourcingCandidateValidation.js`.
- shared by manual/discovery = YES. `api/ai-execute.js` agrega candidatos canónicos al resultado del gateway, incluso con cache; `api/sourcing-discovery.js` reutiliza ese gateway y el mismo verificador para los productos detectados por collectors.
- provenance model = valor, OBSERVED/DERIVED/UNKNOWN, fuente, URL, fecha y dependencias de cálculo. Las declaraciones del modelo se conservan en `claims`, sin convertirse en observaciones.
- evidence model = observaciones por campo, comprobaciones de presencia, factores con puntos/motivos/enlaces y snapshot canónico persistido. Los registros antiguos se revalidan al leerlos.
- Source verifier = ficha HTTPS de hosts autorizados, identidad exacta en Product JSON-LD, precio USD de oferta específica e imagen vinculada a ese Product. Redirects se verifican; no se aceptan credenciales, hosts arbitrarios ni recursos sin MIME de imagen. Un proveedor bloqueado produce UNKNOWN.

## MANUAL RESEARCH

- status = NOT VERIFIED en producción. El flujo con fixtures y respuestas HTTP simuladas está probado.
- real candidates = UNKNOWN; no se ejecutó investigación paga real.
- observed fields = identidad, identificadores, precio, imagen y disponibilidad únicamente cuando la fuente los acredita; señales internas por producto cuando existen.
- derived fields = puntuación, cobertura de evidencia y margen con cotización completa. El análisis de importación reutiliza `calculateInternationalPricing`.
- unknown fields = se conservan como null/UNKNOWN, con sus declaraciones originales disponibles para revisión.
- images = ficha exacta + comprobación HTTP/MIME; placeholder si no se pueden verificar, conservando el candidato.
- identifier verification = AI_DECLARED, SOURCE_EXTRACTED y SOURCE_VERIFIED separados.
- market presence = PRESENT/VERIFIED_ABSENT/UNKNOWN separados; consulta fallida nunca demuestra ausencia.
- score = determinista, explicado por factores y evidencia.
- confidence = cobertura de evidencia separada del score, UNKNOWN sin evidencia.

## AUTOMATIC DISCOVERY

- status = NOT VERIFIED en producción. Pruebas locales del endpoint con collectors y gateway simulados: PASS.
- signals used = release_events (Radar y Calendar son una misma fuente), international_products, ml_raw_items y sourcing_signals. Su disponibilidad real durante una ejecución productiva es NOT VERIFIED.
- candidates generated = UNKNOWN en producción. Los candidatos de Radar/retailers se conservan aunque no puedan corroborarse.
- outside watchlist discovery = YES en implementación y pruebas. Watchlist prioriza; no limita los productos a investigar.
- evidence validation = mismo verificador que Manual Research.
- scoring = mismo cálculo determinista.
- confidence = misma cobertura; sin default 80.
- deduplication = título y atributos de variante; conflictos de identificadores no se fusionan. Una colisión persistida se informa y conserva el registro anterior.
- purchases executed = 0 durante esta tarea; capacidad de compra NONE en el flujo implementado.
- auto publications = 0 durante esta tarea; AUTO_PUBLISH=false.
- run auditing = error de persistencia del inicio impide ejecutar investigación paga; errores de collectors o persistencia se reportan.

## IMAGES

- root cause = el componente conservaba `imageError` al cambiar la URL; además se aceptaban URLs declaradas sin probar su relación con el producto ni su respuesta real.
- fix = reset del error cuando cambia `src`/`image_url`, relación exacta en la ficha y verificación HTTP/MIME del recurso.
- verified exact images = NOT VERIFIED con proveedores reales; fixtures de ficha exacta y recursos HTTP/MIME: PASS.
- placeholders = conservan la tarjeta y el estado desconocido; no se elimina el producto por carecer de imagen.
- Limitación = sitios sin Product JSON-LD compatible, títulos distintos, protección antibot o HEAD bloqueado permanecen UNKNOWN. No se afirma que una imagen esté rota solamente por no poder verificarla.

## IDENTIFIERS

- AI_DECLARED = declaración sin verificación; no habilita consultas por identificador.
- SOURCE_EXTRACTED = formato extraído de URL Amazon válida; todavía no acredita el producto.
- SOURCE_VERIFIED = identificador corroborado en la ficha del producto exacto.
- unverified identifiers blocked downstream = YES en implementación y pruebas. TiendaMia recibe identificador verificado y lo comprueba nuevamente en servidor; la importación de candidatos sin identidad comprobada queda bloqueada.

## TIENDAMIA

- cache 404 root cause = se detectó la falta del esquema de cache esperado y una ruta de consulta deshabilitada. La respuesta HTTP 404 específica de una ejecución real es NOT VERIFIED en esta sesión.
- fix = consulta autenticada `/api/sourcing-market-presence`, revalidación de identidad en servidor y migración de cache con RLS. El cliente ya no depende de la Edge Function deshabilitada ni escribe cache directamente.
- PRESENT/VERIFIED_ABSENT/UNKNOWN semantics = PASS en pruebas. HTTP 404/500, captcha, timeout o HTML ambiguo: UNKNOWN. Ausencia exige búsqueda exitosa y negativa explícita del ASIN exacto.
- production behavior = NOT VERIFIED.

## PRICING

- UNKNOWN→0 removed = YES en los campos de sourcing y cálculos modificados. Un cero realmente observado sigue siendo cero.
- canonical landed cost reused = YES: `candidateImportAnalysis.ts` llama al motor existente, exigiendo precio observado y shipping/customs/fees explícitos para sourcing.
- invalid margin calculations removed = YES. Sin costo completo y precio de venta válido, el margen es null/No calculable; `origin_price` nunca sustituye `landed_cost`.
- Cotización = el administrador puede completar inputs en el análisis de importación; no se inventa una cotización desde GPT.
- Mercado Libre = precios conservan moneda observada; no hay conversión fija /40. Conteos incluyen solo coincidencias exactas; sellers_count es UNKNOWN sin información de vendedores. Un corpus limitado vacío no demuestra ausencia.

## OPPORTUNITY / CONFIDENCE

- deterministic = YES.
- evidence backed = YES en implementación y pruebas.
- absence-alone points = NO. Una brecha necesita evidencia independiente de interés.
- listing/preorder-as-momentum = NO.
- confidence separate from score = YES.
- artificial default removed = YES de los candidatos y defaults incluidos en la migración. La configuración de modelos, presupuesto, prompts y batching del gateway se conserva.

## DATABASE

- migrations created = `supabase/migrations/20261003051753_sourcing_market_cache_verification.sql`, generada con CLI.
- migrations applied production = NO.
- verification = inspección de tablas disponible; ejecución SQL/aplicación NOT VERIFIED. MCP exige aprobación y la política de la sesión es `never`; CLI sin token de acceso y conexión REST desde terminal bloqueada.
- migration scope = cache/RLS, defaults de confianza, permisos de escritura reservados a service_role, identidad por país/variante en lugar de título/retailer, cuarentena de cálculos antiguos sin borrar candidatos ni evidencia.
- No se modificaron Edge Functions. Vercel no aplica automáticamente esta migración.

## TESTS

- passed = 64 pruebas en siete suites: canonical validation, discovery shared pipeline, product images, anti-synthetic pipeline, result limits/batching, security/capabilities y research_cost_control.
- failed = 0 en esas suites.
- research_cost_control = 7/7 PASS después de actualizar únicamente expectativas obsoletas verificadas contra HEAD: ECONOMICO/PROFUNDO 2000 tokens, ESTANDAR 1200 y prompt/schema con image_url. No se cambiaron límites, modelos ni comportamiento productivo.
- TypeScript global = FAIL por errores existentes en otros archivos (incluidos módulos anteriores de sourcing). No se reportaron errores en los componentes y servicios modificados en la revisión final con `tsc -p tsconfig.app.json --noEmit`.
- `node --check` para ambos handlers principales = PASS.
- `git diff --check` = PASS.
- Las pruebas HTTP y de collectors usan mocks. No equivalen a validación funcional real en producción.

## BUILD / COMMIT / PUSH / DEPLOY

- BUILD = PASS; `frontend/npm run build`, Vite, 2131 módulos. Persisten advertencias de tamaño de chunks y Browserslist.
- COMMIT = BLOCKED. `git add` con lista explícita de archivos falló: `Unable to create .../.git/index.lock: Permission denied`. La sesión tiene `.git` sin permiso de escritura. No se creó commit.
- PUSH = BLOCKED. El diagnóstico `git push --dry-run origin main` falló al conectar a GitHub:443. No se publicó un commit y no se disparó CI/CD.
- DEPLOY = NOT EXECUTED.
- No se stagearon secretos, archivos .env ni cambios ajenos.

## PRODUCTION VALIDATION

- Dominio existente = accesible en navegador; login visible. Esto no acredita un deploy de esta tarea ni un HTTP 200 verificado de la nueva implementación.
- MANUAL RESEARCH = NOT VERIFIED; sin sesión administrativa autenticada y sin código nuevo desplegado.
- AUTOMATIC DISCOVERY = NOT VERIFIED; sin migración aplicada ni código nuevo desplegado.
- URLs/imágenes exactas con proveedores reales = NOT VERIFIED.

## REMAINING ISSUES

1. Habilitar escritura Git y conexión GitHub en una sesión que permita terminar commit/push.
2. Aplicar la migración específica mediante el procedimiento Supabase autorizado; verificar esquema, RLS y lectura de registros antiguos.
3. Esperar el deploy del commit en Vercel y confirmar que collectibles.uy sirve ese commit.
4. Con sesión SUPERADMIN, ejecutar Manual Research y Automatic Discovery reales; revisar evidencia, URLs de imágenes, estados de mercado, cotizaciones y repetición del run.
5. Mantener UNKNOWN para fuentes sin evidencia accesible. Las comprobaciones reales pendientes no se sustituyen por resultados de tests ni por la accesibilidad del sitio antiguo.

La tarea no cumple todavía la definición de DONE del workspace porque faltan migración, commit/push/deploy y validación funcional real.

## Continuación de entrega solicitada

Se continuó desde estos mismos archivos sin rediseñar ni reimplementar Sourcing.
`git status`, revisión de diff y `git diff --check`: realizados. Ningún .env,
secreto ni archivo temporal aparece en la lista de archivos de la entrega.
La migración existente fue leída íntegramente; su aplicación sigue pendiente.
No hay un `.git/index.lock` existente que pueda eliminarse para resolver el error.
La inspección ACL confirma reglas DENY explícitas de escritura sobre `.git`;
el sandbox de esta sesión además lo declara de solo lectura y prohíbe escalación.
No se alteraron ACLs ni se recreó el repositorio para eludir estas restricciones.

- COMMIT_SHA = NONE; no se creó commit de esta implementación.
- VERCEL_DEPLOY = NOT EXECUTED.
- DEPLOY_STATUS = NOT VERIFIED.
- SUPABASE MIGRATION = NOT APPLIED.
- DATABASE VERIFIED = NOT VERIFIED.
- TESTS = 64/64 PASS; 0 fallos en las siete suites seleccionadas.
- BUILD = PASS, repetido tras actualizar los tests legacy (12.36 segundos).
- MANUAL RESEARCH REAL = NOT VERIFIED.
- AUTOMATIC DISCOVERY REAL = NOT VERIFIED.
- IMAGES REAL = NOT VERIFIED.
- TIENDAMIA REAL = NOT VERIFIED.
- IDENTIFIER PROVENANCE REAL = NOT VERIFIED.
- UNKNOWN SEMANTICS REAL = NOT VERIFIED.
- OPPORTUNITY SCORE REAL = NOT VERIFIED.
- CONFIDENCE REAL = NOT VERIFIED.
- PURCHASES = 0; ninguna prueba productiva ni compra ejecutada.
- AUTO PUBLICATIONS = 0.

La búsqueda estática no encontró `sourcing_market_cache` en los dos servicios
cliente modificados de TiendaMia/Mercado Libre. La ausencia de requests reales
404 después del despliegue sigue NOT VERIFIED; una comprobación estática no
reemplaza la prueba productiva solicitada.
