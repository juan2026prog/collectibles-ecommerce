# Diagnóstico de producción — peluches de batman

## Versión realmente ejecutada

El repositorio local está limpio en `37e2f6ee68e01204bdf2e7eb6e58fda98e9ac248` al iniciar el diagnóstico.
Sin embargo, la consulta de Vercel para `collectibles.uy` identifica el deployment
`dpl_Ez8ofNjsspsQn8oXxvwy2B3RN6Bw`, READY, del commit
`fbc5d8875803f0100bf776a1b0eae9805044d4cd`.

El deployment de `37e2f6e`, `dpl_6spof5T9RbJCuTqqAz9mcRegDgZG`, está ERROR:

```
errorCode: exceeded_serverless_functions_per_deployment
errorStep: patchBuild
errorMessage: No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan.
```

El repositorio tiene 13 archivos de función en `api/`; este commit agregó
`api/sourcing-market-presence.js`. Por tanto, el build local exitoso no logró
publicar las funciones en Vercel. El alias oficial continúa en la versión anterior.

Fuentes verificadas mediante el conector Vercel:

- [Deployment activo fbc5d88](https://vercel.com/juans-projects-05818af2/collectibles-ecommerce/Ez8ofNjsspsQn8oXxvwy2B3RN6Bw)
- [Deployment fallido 37e2f6e](https://vercel.com/juans-projects-05818af2/collectibles-ecommerce/6spof5T9RbJCuTqqAz9mcRegDgZG)

## DIAGNOSTIC A — RESULT COUNT

Ejecución que coincide con el resultado final de un candidato:

| Campo | Evidencia / valor |
|---|---|
| RUN_ID de base de datos | UNKNOWN; lectura SQL bloqueada |
| Request ID inicial | req_1791033599895_imu06 |
| Request ID posterior al provider | req_8ab194dabad4460b9fe3d8604cdd952c |
| TIMESTAMP | 2026-10-03 13:19:59 UTC, inicio indicado por logs de la invocación |
| MODEL | gpt-4o-mini |
| MODE | ECONOMICO |
| REQUESTED_LIMIT | AUTO |
| RESOLVED_LIMIT | 15 |
| TARGET_COUNTRY | UY |
| EXPECTED_BATCHES | 1 |
| EXECUTED_BATCHES | 1 |
| CACHE_HIT | NO para la respuesta final: se ejecutó OpenAI y hubo consumo real |
| CACHE_LAYER / CACHE_ITEM_COUNT | UNKNOWN; no se recuperó una fila de cache |
| OPENAI_RAW_ITEMS | UNKNOWN sin el texto completo; el log raw_items_detected usa el conteo del parser |
| PARSED_ITEMS | 11 |
| ITEMS_BEFORE_DEDUPE | 11 entrantes; acumulación previa 0 |
| ITEMS_AFTER_DEDUPE | 1 |
| DEDUPE_REMOVED | 10 |
| EARLY_STOP | NO |
| EARLY_STOP_REASON | COMPLETED |
| BUDGET_CAP | NO |
| SATURATION | NO |
| OPENAI_STATUS | completed |
| INCOMPLETE_REASON | null |
| TOKEN_TRUNCATION | NO indicada por el provider; posible reparación JSON no puede evaluarse sin raw completo |
| INPUT_TOKENS | 8174 |
| OUTPUT_TOKENS | 1954 |
| TOTAL_TOKENS | 10128 |
| RAW_RESPONSE_LENGTH | 7008 caracteres |
| COST_USD | 0.002399 |
| ROOT_STAGE | DEDUPE para la reducción demostrada de 11 a 1 |

ROOT_CAUSE demostrada: el servidor de la versión anterior fusionó diez entradas
antes de responder al cliente. El resultado de un candidato no nace del filtro
de la vista ni demuestra que OpenAI encontrara solamente un producto.

La legitimidad de esas diez fusiones y la regla específica que coincidió
siguen NOT VERIFIED: los logs no guardan los once títulos/identificadores ni el
JSON completo. El código de `fbc5d88` fusiona por ASIN declarado o título
normalizado sin la protección nueva de procedencia/variantes. Es un mecanismo
posible, no prueba de que ese ASIN particular fuera el causante de esta ejecución.
`37e2f6e` ya contiene protecciones adicionales, pero no está servido por producción.

### Batch 1

```
BATCH_NUMBER = 1
REQUESTED_CANDIDATES = 15
OPENAI_STATUS = completed
INCOMPLETE_REASON = null
RAW_RESPONSE_LENGTH = 7008
RAW_CANDIDATE_COUNT = UNKNOWN (no conteo independiente del parser)
PARSED_CANDIDATE_COUNT = 11
COUNT_BEFORE_DEDUPE = 11 incoming + 0 existing
COUNT_AFTER_DEDUPE = 1
DEDUPE_REMOVED = 10
STOP_REASON = COMPLETED
```

Hay otra ejecución real inmediatamente anterior, a las 13:19:30 UTC:
`req_5a67ef0b242a4476bfc0abea8d84a3d6`, mismo query/configuración/deployment,
12 parseados → 9 después de dedupe, un batch, completed, input 8174, output 2011,
raw 6522 caracteres. No se confunde esa ejecución con la que terminó en uno.
Ninguna de estas ejecuciones fue iniciada durante este diagnóstico.

## DIAGNOSTIC B — IMAGE

| Campo | Valor |
|---|---|
| TITLE | Peluches de Batman de Mattel, informado por el usuario |
| SOURCE | Toyark, informado por el usuario |
| RAW_IMAGE_PRESENT | true, log del usuario |
| SERVICE_IMAGE_PRESENT | true, log del usuario |
| RAW_IMAGE_URL | UNKNOWN |
| SOURCE_VERIFIER_STATUS | NOT EXECUTED en el deployment real identificado; wrapper canónico pertenece a 37e2f6e |
| SOURCE_VERIFIER_REASON | No corresponde atribuir rechazo al verificador nuevo en fbc5d88 |
| VERIFIED_IMAGE_URL | UNKNOWN; no se obtuvo respuesta canónica productiva |
| SERVICE_IMAGE_URL | UNKNOWN; booleano de presencia no proporciona URL |
| CANONICAL_IMAGE_URL | UNKNOWN |
| ADMIN_CANDIDATE_IMAGE_URL | UNKNOWN |
| VIEW_IMAGE_URL | UNKNOWN |
| IMG_SRC / IMAGE_DOMAIN | UNKNOWN |
| HTTP_HEAD / HTTP_GET | NOT VERIFIED; falta la URL exacta |
| FINAL_URL / CONTENT_TYPE / CONTENT_LENGTH | UNKNOWN |
| IS_IMAGE_MIME / EXACT_PRODUCT_RELATIONSHIP | UNKNOWN |
| RENDER_ATTEMPTED / ONLOAD / ONERROR | UNKNOWN; no se dispone del navegador de esa ejecución |
| ROOT_STAGE / ROOT_CAUSE de la imagen | NOT VERIFIED |

El componente de la versión realmente desplegada no resetea `hasError` cuando
cambia `src`. El componente local de `37e2f6e` sí tiene `useEffect` dependiente de
`src`, y la prueba de error seguido de cambio de URL pasa. Esto demuestra una
diferencia entre versiones, no que el estado React fuera la causa de esta imagen.
Sin URL/DOM/request no se decide entre estado persistente, URL inválida, HTML,
hotlink o un fallo de carga transitorio.

No se muestran imágenes aproximadas ni se relaja el verificador. Toyark no figura
en su lista local de hosts soportados; si la URL de fuente efectivamente es de ese
host, el código nuevo conservaría UNKNOWN. No se toma el nombre del retailer como
prueba de dominio ni se atribuye ese rechazo a la ejecución antigua.

## Acceso a evidencia y siguiente paso

Se intentó SELECT de esquema de las tablas de telemetry/cache mediante Supabase.
La herramienta devolvió `MCP tool call requires approval, but approval policy is never`.
No se ejecutó SQL ni se accedió al raw almacenado. El conector Vercel sí permitió
recuperar los logs de ambas ejecuciones y los SHA/errores de deployment.

Se solicitó al usuario la URL exacta y, si está disponible, el JSON de la respuesta,
sin credenciales. Estos datos permiten comprobar HTTP HEAD/GET, relación exacta y
si el dedupe fusionó productos distintos. No se ejecutó una investigación paga nueva.

La corrección del bloqueo de deploy debe reducir el empaquetado a doce funciones
sin eliminar la consulta de mercado ni relajar controles. No se implementa un
cambio productivo antes de completar el diagnóstico solicitado de ambos problemas.
No hace falta una migración para el límite de funciones de Vercel.

## Estado de entrega de este diagnóstico

- RESULT COUNT FIX = ninguno nuevo; protecciones previas de 37e2f6e aún sin desplegar.
- BEFORE_PROVIDER_ITEMS = 1 en el trace del cliente aportado; este conteo ya viene después del dedupe servidor.
- AFTER_PROVIDER_ITEMS = NOT VERIFIED; no se ejecutó un retest.
- IMAGE FIX = ninguno nuevo; root cause de la imagen pendiente.
- TESTS = 64/64 PASS en las siete suites focalizadas existentes, incluidos reset de imagen y pipeline compartido.
- BUILD = PASS, Vite, 2131 módulos, 10.31 segundos. No demuestra que Vercel acepte trece funciones.
- COMMIT / PUSH = no hay nuevos cambios de aplicación ni commit de fix.
- DEPLOYED_SHA = fbc5d8875803f0100bf776a1b0eae9805044d4cd.
- EXPECTED_SHA = 37e2f6ee68e01204bdf2e7eb6e58fda98e9ac248; deployment FAIL.
- REAL PRODUCTION RETEST = NOT EXECUTED.
- PROVIDER/GATEWAY/SERVICE/VIEW posterior = NOT VERIFIED.
- VISIBLE_VERIFIED_IMAGES = NOT VERIFIED.
- MANUAL_RESEARCH_STATUS = PARTIAL: diagnóstico del punto de reducción demostrado, imagen y retest pendientes.
- AUTOMATIC_DISCOVERY_IMPACT = NEEDS_FOLLOWUP; no se modificó ni se ejecutó.
- PURCHASES / AUTO PUBLICATIONS durante esta tarea = 0 / 0.

REMAINING_ISSUES: raw de la ejecución y URL exacta; causa específica de las fusiones;
diagnóstico HTTP/render de la imagen; bloqueo de funciones de Vercel; despliegue del
SHA correcto y una única prueba real posterior. No se declara DONE ni imagen arreglada.
