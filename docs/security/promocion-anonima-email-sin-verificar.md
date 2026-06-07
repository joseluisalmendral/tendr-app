# Promoción anónima con email sin verificar

Nota de seguridad sobre la promoción de cuentas anónimas a permanentes y el
riesgo de aceptar un correo sin verificación real de propiedad.

## 1. El flujo

Tendr permite que un visitante anónimo (sesión `is_anonymous = true`) se
convierta en usuario permanente conservando su `auth.uid()`. Esto preserva toda
fila con `workspace_id` sin migración de datos.

El mecanismo es `supabase.auth.updateUser({ email })`
(`app/login/actions.ts`, rama anónima de `sendMagicLink`), que asocia el correo
al mismo usuario en lugar de crear uno nuevo.

El comportamiento depende del ajuste **Confirm email** del proyecto Supabase:

- **Confirm email ACTIVADO (modo recomendado):** `updateUser` deja el cambio de
  email *pendiente* y envía un enlace de verificación. El usuario devuelto en la
  respuesta sigue siendo anónimo. La promoción se completa cuando el usuario abre
  el enlace y `/auth/callback` (`app/auth/callback/route.ts`) verifica el OTP. El
  correo solo queda asociado tras comprobar que el usuario controla el buzón.

- **Confirm email DESACTIVADO (estado actual del entorno de curso/dev):**
  `updateUser` aplica el correo **de forma inmediata y en el sitio**: no se envía
  ningún enlace, la respuesta ya trae `is_anonymous = false`,
  `email_confirmed_at` se rellena automáticamente **sin verificación real de
  propiedad**, y `/auth/callback` **nunca se ejecuta**.

## 2. El trade-off de seguridad

Con Confirm email **desactivado**, cualquiera puede reclamar un correo que **no
le pertenece**:

- Superficie de **suplantación**: el correo no verificado puede usarse luego
  para notificaciones, facturación o recuperación de cuenta, todo atado a una
  dirección que el usuario nunca demostró controlar.
- El **propietario legítimo** de ese correo queda después **bloqueado**: al
  intentar asociarlo recibirá `email_exists` (no hay fusión de cuentas en el
  MVP) y se le pedirá usar otra dirección.

Este trade-off es **aceptable únicamente para el entorno de curso/desarrollo**,
donde la fricción del enlace de verificación estorba a la iteración. **No es
aceptable en producción.**

## 3. Alternativa para producción (NO implementada)

No implementar aquí; documentado para cuando se promueva a producción:

- **Activar Confirm email** en el proyecto Supabase. Con ello `updateUser` vuelve
  a enviar un enlace de verificación y `/auth/callback` completa la promoción
  tras comprobar la propiedad del buzón. **El código ya soporta esta ruta** sin
  cambios (la rama anónima de `sendMagicLink` queda en silencio y el callback
  vuelve a ser el único escritor del registro de auditoría).
- Alternativamente, un flujo **OTP explícito** (`signInWithOtp` / `verifyOtp`)
  para comprobar el correo **antes** de asociarlo a la sesión.

## 4. Brecha de auditoría detectada

El RPC `log_promotion` (migración `db/migrations/0002_log_promotion.sql`,
`SECURITY DEFINER`, concedido solo a `authenticated`) escribe **una** fila
`promote_user` en `audit_log` para cada promoción.

Hallazgos:

- **Ruta auto-confirm sin auditoría:** el `log_promotion` se llamaba *solo* desde
  `/auth/callback` (`app/auth/callback/route.ts`). Como la ruta auto-confirm
  (Confirm email OFF) **omite** `/auth/callback`, el RPC **nunca se ejecutaba** y
  `audit_log` no recibía ninguna fila `promote_user`. Verificado en vivo en el
  proyecto cloud: hubo una promoción con **cero rastro de auditoría**; la fila se
  insertó manualmente después.
- **Migración 0002 ausente en cloud:** además, la migración `0002` faltaba en el
  proyecto cloud. Ya fue **aplicada**, el journal **reparado**, y la fila que
  faltaba **backfilleada** con `metadata.backfill = true`.

### Corrección de código (Task 1)

En la rama anónima de `sendMagicLink` (`app/login/actions.ts`) ahora se captura
la respuesta de `updateUser`. Si `data.user.is_anonymous === false` (auto-confirm
aplicó el cambio en el sitio), se llama a `supabase.rpc("log_promotion")` con
semántica *best-effort* (se ignora su error, igual que el callback), porque con
las confirmaciones desactivadas **no hay enlace → no hay callback → este es el
único lugar donde puede escribirse la fila de auditoría**. Con las confirmaciones
**activadas** el usuario devuelto sigue siendo anónimo, esta rama permanece en
silencio y el callback continúa siendo el **único escritor** — sin doble registro
en ninguno de los dos modos.

UX: cuando auto-confirm aplica el cambio, `sendMagicLink` devuelve el estado
`promoted` (en lugar del `sent` de "revisa tu correo"), y la página de login
muestra una confirmación neutral de "cuenta vinculada", ya que en ese modo no se
envió ningún correo.

## 5. Nota operativa

Las migraciones deben aplicarse a **ambos** stacks (local y cloud). El journal de
cloud había derivado: `0002` / `0003` estaban ausentes o fuera de banda. Verificar
la paridad de migraciones entre stacks como parte del cierre de fase.
