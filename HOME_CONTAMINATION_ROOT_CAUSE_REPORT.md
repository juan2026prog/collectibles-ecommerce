# REPORT: HOME CONTAMINATION ROOT CAUSE ANALYSIS & REMEDIATION

**Project**: Collectibles E-Commerce (Uruguay)  
**Issue**: The main home page rendered the "Beyblade X Uruguay" Hero instead of the standard Collectibles Hero Slider.  
**Severity**: Critical  
**Resolution**: Completed (Contamination removed, database views/schema deleted, default Hero restored).

---

## 1. Causa Exacta y Flujo de Contaminación

La causa raíz fue un **diseño cruzado de base de datos y la omisión de validaciones de inquilinos (tenant isolation)** en la página de inicio al integrar accidentalmente componentes del proyecto Beyblade en el repositorio de Collectibles.

### Paso a Paso del Incidente:
1. **Commit `8db42c9` (Autor: `juan2026prog`)**:
   - Se introdujo una migración para crear el esquema `beyblade` y la tabla `beyblade.hero_banners`.
   - Se modificó `Home.tsx` para importar `BeybladeHeroBanner` y consultar `supabase.schema('beyblade').from('hero_banners')`.
2. **Error PGRST106 en Producción**:
   - Como PostgREST en Supabase solo expone por defecto el esquema `public`, la API fallaba con error de esquema inválido al intentar usar `.schema('beyblade')`.
3. **Commit `03a07ff` (Autor: `juan2026prog`)**:
   - Para resolver el error de API sin reconfigurar Supabase, el desarrollador creó la vista `public.hero_banners` apuntando a `beyblade.hero_banners` (`CREATE VIEW public.hero_banners AS SELECT * FROM beyblade.hero_banners;`).
4. **Commit `56e7e6b` (Autor: `juan2026prog`)**:
   - Se removió el modificador `.schema('beyblade')` de la consulta en `Home.tsx`.
   - Esto causó que la consulta `supabase.from('hero_banners')` apuntara a la vista `public.hero_banners`.
5. **Fuga de datos (Data Leak)**:
   - Dado que la vista contenía banners activos de Beyblade, la consulta en `Home.tsx` devolvía un registro válido. La condición condicional `if (beybladeBanner)` en la Home de Collectibles se cumplía, sustituyendo el `HeroSlider` original por el componente de Beyblade.

---

## 2. Archivos Responsables y Líneas de Código Originales

### A. Frontend: `frontend/src/pages/Home.tsx`
* **Línea 13**: `import BeybladeHeroBanner from '../components/BeybladeHeroBanner';`
* **Líneas 241-272**: Estado y efecto para obtener el banner de la vista:
  ```typescript
  const [beybladeBanner, setBeybladeBanner] = useState<any>(null);
  const [beybladeBannerLoading, setBeybladeBannerLoading] = useState(true);

  useEffect(() => {
    ...
    supabase.from('hero_banners').select('*').eq('is_active', true)...
  }, [country]);
  ```
* **Líneas 510-515**: Reemplazo condicional del Hero principal:
  ```typescript
  case 'hero': {
    if (beybladeBannerLoading) {
      return <BeybladeHeroBanner banner={{} as any} loading={true} />;
    }
    if (beybladeBanner) {
      return <BeybladeHeroBanner banner={beybladeBanner} />;
    }
    return <HeroSlider banners={banners} loading={bannersLoading} />;
  }
  ```

### B. Base de Datos (Migraciones):
* `supabase/migrations/20261017000000_beyblade_hero_banners.sql` (Creación de esquema `beyblade` y tablas).
* `supabase/migrations/20261019000000_public_hero_banners_view.sql` (Creación de la vista `public.hero_banners` apuntando a `beyblade`).

### C. Rutas y Sidebar:
* `frontend/src/App.tsx` (Ruta `/admin/hero-banners` y carga lazy del panel de control de Beyblade).
* `frontend/src/layouts/AdminLayout.tsx` (Enlace de navegación lateral hacia el Hero Banner Beyblade).

---

## 3. Cambios Realizados (Remediación)

Para eliminar por completo cualquier tipo de contaminación y restaurar el estado anterior, se realizaron los siguientes cambios:

1. **Restauración de `Home.tsx`**:
   - Se removió el import de `BeybladeHeroBanner`.
   - Se eliminaron las variables de estado `beybladeBanner` y `beybladeBannerLoading`, así como el `useEffect` que consultaba la tabla `hero_banners`.
   - Se restauró el caso `'hero'` en `renderBlock` para retornar únicamente el slider original de Collectibles: `<HeroSlider banners={banners} loading={bannersLoading} />`.
2. **Eliminación de Rutas y Menús**:
   - En `App.tsx`, se removió la importación lazy de `AdminHeroBanners` y la definición de su ruta.
   - En `AdminLayout.tsx`, se eliminó el menú lateral de "Contenido" y el link a `/admin/hero-banners`.
3. **Purga de Archivos Físicos**:
   - Se eliminó el componente `BeybladeHeroBanner.tsx`.
   - Se eliminó la página de administración `AdminHeroBanners.tsx`.
   - Se borró el asset de imagen `beyblade_x_transparent.png` de la carpeta pública de imágenes.
   - Se eliminaron físicamente las dos migraciones comprometidas (`20261017000000` y `20261019000000`).
4. **Limpieza en la Base de Datos**:
   - Se ejecutó el comando DDL en el clúster de Supabase:
     ```sql
     DROP VIEW IF EXISTS public.hero_banners CASCADE;
     DROP SCHEMA IF EXISTS beyblade CASCADE;
     ```
5. **Verificación Técnica**:
   - Se comprobó la integridad del frontend mediante compilación TypeScript limpia (`npx tsc --noEmit`) y la compilación exitosa del bundle de producción (`npm run build`).

---

## 4. Por Qué Ocurrió

* **Falta de Separación Física**: Al no trabajar con repositorios separados o con una arquitectura multisitio basada en identificador de cliente (`site_id` / `tenant_id`), los desarrolladores que trabajan en proyectos distintos (Beyblade y Collectibles) mezclan el código en una sola rama/repositorio compartiendo la base de datos Supabase.
* **Saltos de Seguridad en Base de Datos**: Crear vistas en el esquema `public` que apuntan a esquemas privados sin filtros adecuados expone los datos de forma global y elude las validaciones de consulta frontend.

---

## 5. Cómo Evitar que Vuelva a Suceder

1. **Aislamiento Estricto de Repositorios (Multi-tenancy)**:
   - Proyectos de marcas distintas (Beyblade, Collectibles, etc.) deben vivir en repositorios separados de GitHub o en monorrepositorios fuertemente desacoplados donde no se compartan vistas ni esquemas directamente en la Home sin comprobar el `site_slug` del inquilino actual.
2. **Uso de Variables de Entorno para Feature Flags**:
   - Si se requiere integrar múltiples experiencias en un solo frontend, el renderizado de banners específicos debe estar supeditado a una variable de entorno como `VITE_PROJECT_THEME=collectibles` o validación del host (ej. `window.location.hostname`).
3. **CI/CD de Base de Datos Estricto**:
   - Establecer políticas en el pipeline de CI/CD para que cualquier nueva migración que cree esquemas adicionales que no pertenezcan al ecosistema de Collectibles (`public`, `auth`, `storage`) sea rechazada automáticamente.
