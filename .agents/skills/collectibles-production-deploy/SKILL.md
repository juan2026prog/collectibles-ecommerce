---
name: collectibles-production-deploy
description: Deploys completed Collectibles code changes safely to the official production site collectibles.uy. Use after any task that creates, edits, fixes, refactors or otherwise changes application code or production configuration in the Collectibles workspace.
---

# Collectibles — Production Deploy Skill

## Definición de DONE

Una tarea de código en el workspace de Collectibles **NO está terminada** hasta que se cumplan todos los criterios siguientes:

```
CODE COMPLETE + BUILD PASS + GIT COMMIT + GIT PUSH + VERCEL PRODUCTION DEPLOY + COLLECTIBLES.UY VERIFIED
```

Guardar archivos localmente **no es suficiente**. El trabajo queda institucionalizado en producción cuando `https://collectibles.uy` refleja los cambios.

---

## Cuándo ejecutar esta Skill

### ✅ EJECUTAR después de tareas que:

- Creen archivos de aplicación nuevos
- Modifiquen archivos de código existentes
- Corrijan bugs
- Agreguen funcionalidades
- Modifiquen UI, lógica, APIs
- Modifiquen configuración relevante para producción
- Realicen refactors
- Cambien dependencias (`package.json`, `package-lock.json`)
- Cambien comportamiento de frontend o backend

### ❌ NO ejecutar si la tarea fue exclusivamente:

- Análisis o investigación sin modificar código
- Explicación o lectura de código
- Auditoría sin cambios al repositorio
- Planificación o documentación que no afecta la aplicación
- Consulta del usuario sin modificación del repositorio

> El deploy se realiza **UNA SOLA VEZ** al finalizar la tarea completa, no después de cada archivo modificado.

---

## Procedimiento de Deploy

### PASO A — Revisar cambios

```powershell
git status -s
```

Identificar exactamente qué archivos fueron modificados **durante la tarea actual**.

> **IMPORTANTE:** No incluir automáticamente cambios ajenos a la tarea.
> No usar `git add -A` indiscriminadamente si existen cambios preexistentes no relacionados.
> Si `git status` muestra archivos que no pertenecen a la tarea, dejarlos intactos.
> Stagear únicamente los archivos correspondientes al trabajo realizado.

---

### PASO B — Validación

Ejecutar como mínimo:

```powershell
cd c:\Projects\Collectibles2026\frontend
npm run build
```

Si existen tests directamente relacionados con la funcionalidad modificada y el proyecto los tiene disponibles, ejecutarlos. No inventar suites inexistentes. Usar únicamente las herramientas reales del repositorio.

---

### PASO C — BUILD GATE (obligatorio)

**Si `npm run build` falla:**

1. ❌ NO hacer commit
2. ❌ NO hacer push
3. ❌ NO hacer deploy
4. Investigar el error
5. Corregirlo si pertenece a la tarea actual
6. Volver a ejecutar el build
7. Continuar **solamente** cuando el build sea exitoso

> Nunca desplegar deliberadamente un build roto.

---

### PASO D — Git Commit y Push

Después de build exitoso:

```powershell
git status -s
```

Agregar únicamente los archivos correspondientes a la tarea. Ejemplo:

```powershell
git add <archivo1> <archivo2> ...
```

Crear un mensaje de commit descriptivo siguiendo el estilo existente del proyecto:

```
feat: improve vault sharing experience
fix: prevent mobile layout overflow
refactor: simplify collector comparison
chore: update production configuration
```

Ejecutar:

```powershell
git commit -m "<mensaje descriptivo>"
git push
```

> Si los cambios ya fueron committeados durante la propia tarea, no generar otro commit innecesario.
> En ese caso, verificar que estén pusheados y continuar con el deploy.
> No crear commits vacíos.

---

### PASO E — Pipeline de Producción (GitHub CI/CD → Vercel Production)

El repositorio de GitHub (`https://github.com/juan2026prog/collectibles-ecommerce.git`) está conectado a Vercel con Continuous Deployment automático en la rama `main`.

Una vez ejecutado:
```powershell
git push origin main
```
El pipeline de Vercel inicia inmediatamente el build y despliegue del commit a producción.

El destino oficial es: **`https://collectibles.uy`**

---

### PASO F — Verificación del dominio oficial (Smoke Check)

Confirmar que `https://collectibles.uy` responde correctamente después del deploy.

**Smoke check mínimo obligatorio:**

- HTTP accesible
- Página principal carga
- No aparece error crítico de Vercel
- No aparece página 404/500 general
- El sitio corresponde al proyecto Collectibles

**Verificaciones adicionales por tarea:**

| Funcionalidad modificada | URL a verificar |
|--------------------------|-----------------|
| My Vault                 | `https://collectibles.uy/vault` |
| Radar                    | `https://collectibles.uy/radar` |
| Checkout                 | `https://collectibles.uy/checkout` |
| Perfil / Auth            | `https://collectibles.uy/profile` |
| Marketplace              | `https://collectibles.uy/marketplace` |
| Admin                    | `https://collectibles.uy/admin` |

Si la tarea afecta una URL concreta, verificar también esa URL específica.

Si Antigravity dispone de Browser y la tarea modifica una funcionalidad visual importante, realizar una comprobación visual básica de la página afectada después del deployment.

---

## ⚠️ Deployment URL vs. Producción

Vercel puede devolver una URL del tipo `https://xxxxx.vercel.app`. **Esa URL NO es la confirmación final requerida.**

El endpoint comercial oficial es **`https://collectibles.uy`**.

El proceso se considera completo **únicamente** cuando el deployment de producción está disponible a través de `collectibles.uy`.

---

## Supabase y componentes de infraestructura adicionales

Esta Skill tiene como objetivo principal el deployment web a Vercel.

Si una tarea también modifica:

```
supabase/migrations/
supabase/functions/
```

O cualquier otro componente de infraestructura que necesite un deployment independiente:

- ❌ No asumir que Vercel lo despliega automáticamente
- ✅ Inspeccionar cómo se despliega actualmente ese componente dentro del proyecto
- ✅ Utilizar el procedimiento existente
- ❌ No inventar credenciales ni ejecutar operaciones destructivas
- ✅ Completar ese deployment cuando sea parte necesaria de la tarea
- ✅ Después realizar igualmente el deployment habitual a Vercel cuando corresponda

---

## Seguridad — Prohibiciones absolutas

❌ Nunca mostrar secretos, tokens ni API keys
❌ Nunca commitear `.env`, `.env.local` ni credenciales
❌ Nunca modificar credenciales Vercel innecesariamente
❌ Nunca cambiar la vinculación del proyecto Vercel
❌ Nunca crear otro proyecto Vercel
❌ Nunca deployar cambios no relacionados con la tarea
❌ Nunca sobrescribir trabajo ajeno ni resetear cambios del usuario
❌ Nunca usar `force push` ni `git reset --hard` para limpiar el workspace
❌ Nunca eliminar modificaciones que no pertenezcan a la tarea

Si `git status` contiene archivos no relacionados, dejarlos intactos.

---

## Recuperación ante error

| Error | Acción |
|-------|--------|
| Build falla | Corregir → volver a probar → continuar solo si pasa |
| `git push` falla | Diagnosticar el motivo antes de desplegar |
| Vercel falla | Diagnosticar el deployment antes de declarar completado |
| `collectibles.uy` no responde | Investigar antes de declarar la tarea terminada |

> **NO ocultar errores. NO declarar un deploy exitoso basándose únicamente en que se ejecutó el comando.**

---

## Informe final al usuario

Al terminar una tarea que haya realizado deployment, la respuesta debe incluir brevemente:

```
✓ Build
✓ Commit: <hash o mensaje>
✓ Push
✓ Deploy Production
✓ collectibles.uy verificado
```

No escribir una explicación enorme de operaciones internas. Lo importante es confirmar claramente si producción quedó actualizada.
