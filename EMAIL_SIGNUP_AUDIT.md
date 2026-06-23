# AUDITORÍA DE ENVÍO DE CORREOS EN EL REGISTRO DE NUEVOS USUARIOS

## Resumen de Hallazgos

Se auditó el flujo de registro de nuevos usuarios en `Login.tsx`, los disparadores (triggers) de base de datos de Supabase y los logs del servicio de autenticación de Supabase (GoTrue/Auth). Se identificó la causa exacta del problema por el cual los usuarios no reciben correos al crear su cuenta.

---

## 1. Causa del Problema

### A. Confirmación de Email Desactivada en Supabase (Acceso Inmediato)
* **Log analizado (Servicio Auth):**
  `{"action":"login","immediate_login_after_signup":true,"provider":"email","user_id":"..."}`
* **Diagnóstico:** Los logs de autenticación de Supabase confirman que la configuración `immediate_login_after_signup` está establecida en `true`. Esto significa que cuando un usuario se registra con email y contraseña, Supabase **lo loguea inmediatamente sin requerir confirmación por correo**. 
* Al estar desactivada la confirmación de correo en la consola de Supabase, **el motor de autenticación no envía ningún correo de verificación/confirmación**.

### B. Mensaje Engañoso en la Interfaz (UX Bug)
* **Archivo afectado:** [Login.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/Login.tsx#L40)
* **Línea de código:** 
  ```typescript
  else {
    setSuccess('¡Cuenta creada! Revisá tu email para confirmar.');
    trackCompleteRegistration(generateMetaEventId(), { status: true, user_email: email });
  }
  ```
* **Diagnóstico:** A pesar de que el usuario es logueado de forma inmediata en la base de datos y no se envía ningún correo de confirmación, la pantalla de registro (`Login.tsx`) muestra el mensaje: `"¡Cuenta creada! Revisá tu email para confirmar."` y no realiza ninguna redirección. El usuario se queda esperando un correo electrónico que nunca llegará, pensando que la cuenta está pendiente de confirmación.

### C. Inexistencia de Correo de Bienvenida (Welcome Email)
* **Diagnóstico:** La función Edge de envíos [transactional-emails](file:///c:/Projects/Collectibles2026/supabase/functions/transactional-emails/index.ts) no cuenta con ningún tipo de correo (payload type) de bienvenida (`welcome_email`) ni existe ningún trigger en la base de datos (como un webhook o trigger en `auth.users`) que la llame cuando se registra un usuario en `auth.users` o `public.profiles`.

---

## 2. Recomendaciones y Soluciones

Dependiendo de la experiencia de usuario deseada, existen dos alternativas de resolución:

### Alternativa 1: Registro Inmediato y Fluido (Recomendada)
Si deseas que los usuarios puedan registrarse y comprar al instante sin tener que verificar obligatoriamente su correo:
1. **Corregir `Login.tsx`**: Modificar el flujo de registro para que, al tener éxito, actúe de la misma forma que el login: muestre un mensaje de éxito ("¡Cuenta creada con éxito! Redirigiendo...") y redirija automáticamente al usuario a la página de inicio o tienda tras 1.5 segundos.
2. **Implementar Welcome Email automático**: Opcionalmente, podemos crear un trigger en la base de datos Postgres que llame a la Edge Function `transactional-emails` enviando un correo de bienvenida automático al crearse una fila en `profiles`.

### Alternativa 2: Habilitar Verificación de Email Obligatoria
Si es indispensable que los usuarios validen su dirección de correo antes de usar la plataforma:
1. **Activar en Supabase**: Se debe ingresar al Supabase Dashboard -> **Auth** -> **Providers** -> **Email** y activar la opción **"Confirm Email"** (esto cambiará `immediate_login_after_signup` a `false`).
2. **Configurar SMTP Personalizado**: Al activar la confirmación obligatoria, es crítico configurar un proveedor de SMTP personalizado (como Resend, SendGrid, etc.) en el Supabase Dashboard, ya que el proveedor predeterminado de Supabase tiene un límite estricto de **3 correos por hora**, lo cual bloquea los envíos a los nuevos usuarios rápidamente.
