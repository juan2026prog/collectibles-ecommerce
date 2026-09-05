# COLLECTIBLES 2026 — WORKSPACE RULES & AUTOMATIC DEPLOYMENT PROTOCOL

## Definición de DONE Obligatoria

En este workspace (`c:\Projects\Collectibles2026`), **NINGUNA tarea de código o configuración se considera terminada** al simplemente modificar archivos localmente o generar un walkthrough.

Toda tarea que cree, modifique, refactorice o corrija archivos de la aplicación **DEBE ejecutar obligatoriamente el pipeline completo de despliegue antes de finalizar su turno**:

```
1. VALIDACIÓN / BUILD GATE:
   cd c:\Projects\Collectibles2026\frontend && npm run build
   (Si el build falla con errores, NO commitear ni pushear. Corregir primero el error).

2. GIT STAGE & COMMIT:
   git add <archivos modificados>
   git commit -m "<tipo>(<alcance>): <descripción concisa>"

3. GIT PUSH & PIPELINE DEPLOY:
   git push origin main
   (El repositorio en GitHub está integrado con Vercel CI/CD; el push a origin/main dispara el despliegue de producción oficial a https://collectibles.uy).

4. VERIFICACIÓN DE DOMINIO:
   Comprobar que https://collectibles.uy esté en línea y respondiendo HTTP 200 sin errores críticos.
```

## Reglas de Seguridad y Limpieza
- **Cero filtraciones:** NUNCA commitear archivos `.env`, secretos, tokens ni service role keys.
- **Commits atómicos:** Stagear únicamente los archivos pertenecientes a la tarea actual. No usar `git add -A` a ciegas.
- **No inventar deploys:** No declarar al usuario que el deploy está listo si no se ha ejecutado `git push origin main` y verificado el estado de la aplicación.
