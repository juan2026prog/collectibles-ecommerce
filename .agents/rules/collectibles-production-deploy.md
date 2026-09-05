---
alwaysApply: true
---

# COLLECTIBLES PRODUCTION RULE

## Workspace: Collectibles — `c:\Projects\Collectibles2026`

Dentro de este workspace, una tarea que cree o modifique código de la aplicación **no se considera terminada** al guardar los archivos ni al completar el build local.

Cuando una tarea de implementación haya quedado funcional y validada, debes ejecutar la Skill `collectibles-production-deploy` antes de entregar la respuesta final al usuario.

El destino de producción oficial es **https://collectibles.uy**.

---

## Reglas obligatorias

- **No ejecutar deployment** para tareas que no hayan producido cambios reales en la aplicación (análisis, investigación, lectura, planificación, auditorías sin modificaciones).
- **No desplegar builds fallidos.** El build debe pasar antes de cualquier commit, push o deploy.
- **No incluir en commits** cambios preexistentes o ajenos a la tarea actual. Stagear únicamente los archivos del trabajo realizado.
- **No afirmar que producción fue actualizada** hasta haber verificado el resultado real del deployment en `https://collectibles.uy`.

---

## Referencia

La lógica completa del procedimiento de deploy está definida en:

`@.agents/skills/collectibles-production-deploy/SKILL.md`

Leer esa Skill para el procedimiento detallado paso a paso (Build Gate, Git, Vercel, verificación de dominio, informe final).
