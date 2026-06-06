# ADR-002 · Vercel Hobby: lectura del ToS y condiciones de permanencia

> Decisión arquitectónica versionada. Cambios mayores requieren nuevo ADR que supersede a este.

---

## Estado

Aceptada

## Fecha

2026-06-06

> **Lectura fechada.** Esta lectura del ToS de Vercel se realiza el 2026-06-06. El documento de términos fue actualizado por última vez el **2026-06-01** (cinco días antes de esta lectura) y la página de Fair Use Guidelines el **2026-02-27**. El ToS cambia; la lectura aquí documentada caduca con él. La re-lectura ante cualquier actualización posterior forma parte del criterio de revisión.

## Contexto

Tendr es un SaaS de aprendizaje (curso M5/L17) alojado en Vercel Hobby (ADR-001), con Stripe activo en sandbox y pricing público Free/Pro €9. En algún momento querrá pasar a cobros reales. Antes de seguir construyendo se lee el ToS y los Fair Use Guidelines de la fuente y se documenta a qué se compromete el proyecto.

## Lectura del ToS

Tres restricciones con mayor impacto sobre Tendr, formuladas en términos de qué impiden hacer. Cita textual en inglés, interpretación en español.

1. **No pedir ni procesar pagos de visitantes, ni anunciar la venta de un producto o servicio.**
   Cita: *"Commercial usage is defined as any Deployment that is used for the purpose of financial gain of anyone involved in any part of the production of the project"*, con el ejemplo *"Advertising the sale of a product or service"*.
   Matiz crítico: la página de pricing pública con "Pro €9/mes" es razonablemente interpretable como *advertising a sale* aunque el checkout sea sandbox.

2. **No prometer estabilidad a ningún usuario.**
   Cita: *"We reserve the right to disable or remove any Project or website deployment on the Hobby plan with or without notice at our sole discretion."*
   Interpretación: Tendr en Hobby no puede tener usuarios que dependan de su disponibilidad.

3. **Nadie puede cobrar por trabajar en el proyecto.**
   Cita: *"Receiving payment to create, update, or host the site"* activa el uso comercial aunque la propia aplicación no facture.

### Interpretación para el caso Stripe test mode

Stripe en test mode **no** activa por sí solo el "uso comercial": no se mueve dinero, no hay *financial gain* y el propósito documentado es pedagógico. El riesgo real no es el cobro, sino la **apariencia comercial** —pricing público + botón de suscripción + dominio propio— ante un revisor que decide *at sole discretion*: no necesitan probar que se cobra, basta su criterio.

Línea inequívoca: el **primer cobro real** saca a Tendr de Hobby. La migración debe ejecutarse **antes** de activar cobros reales, nunca después.

## Decisión

Permanecer en Vercel Hobby asumiendo el riesgo documentado, con tres compromisos: (1) disclaimer explícito en el README declarando proyecto de aprendizaje sin actividad comercial, (2) Vercel Pro como camino de salida por defecto, (3) migración obligatoria antes de activar cualquier cobro real.

## Alternativas consideradas

Caminos de salida del plan Hobby y qué cambia operativamente en cada uno.

| Opción | Tradeoff principal |
|---|---|
| Vercel Pro ($20/dev/mes) — **por defecto** | Un click en dashboard; cero cambios de código, mismas envs y deploy; pay-as-you-go en excedentes. Salida inmediata, fricción mínima. |
| Cloudflare Workers/Pages + @opennextjs/cloudflare v1.19.11 | Free tier permite uso comercial, pero adaptador no first-party (validar RSC/Server Actions/`proxy.ts` caso a caso), límite 10ms CPU/request (el trabajo IA sobrevive porque vive en Inngest, ADR-001), recrear envs/dominio/CI-CD. Coste: días. |
| Netlify | Runtime Next.js vía adaptador propio, soporte de Next.js 16 sin verificar a fecha de este ADR; free por créditos (300/mes), menos predecible. Camino más débil hoy. |

## Tradeoffs aceptados

- Se mantiene el pricing público "Pro €9/mes" a sabiendas de que constituye la principal exposición de apariencia comercial bajo el ToS.
- Se acepta la terminación sin aviso (*sole discretion*) como riesgo inherente a Hobby: el proyecto no puede prometer estabilidad a usuarios.
- La salida por defecto (Vercel Pro) tiene coste recurrente ($20/dev/mes); las salidas gratuitas (Cloudflare, Netlify) tienen coste de migración en días y validaciones abiertas.

## Consecuencias

Qué condiciona esta decisión en el resto del producto.

- Fases del caso afectadas: **F2** (el README incorpora disclaimer de uso no comercial / proyecto de aprendizaje).
- El pricing público se mantiene (decisión asumida), sabiendo que es la principal señal de apariencia comercial.
- **Gate de monetización**: checklist previo a activar cobros reales = migrar hosting (Pro u otro) + revisar la capa de pagos de ADR-001 (Merchant of Record / IVA UE).
- Camino de salida: Vercel Pro por defecto (inmediato, sin cambios de código); Cloudflare o Netlify como alternativas con coste de migración en días.

## Criterio de revisión

Bajo qué condiciones se reabre esta decisión.

- Actualización del ToS o de los Fair Use Guidelines de Vercel posteriores al 2026-06-01 / 2026-02-27 (esta lectura caduca con el documento: re-leer la fuente).
- Aviso de Vercel por uso atípico del deployment.
- Decisión de monetizar (activación de cobros reales).
- Cambios en el soporte de Next.js 16 en OpenNext (Cloudflare) o Netlify que alteren la viabilidad de los caminos de salida.

## Referencias

Todas verificadas el 2026-06-06.

- https://vercel.com/legal/terms (Last Updated June 1, 2026)
- https://vercel.com/docs/limits/fair-use-guidelines (last_updated 2026-02-27)
- https://vercel.com/docs/plans/hobby
- ADR-001 (docs/decisions/ADR-001-architecture.md), capas hosting y pagos.

---

*ADR-002. Última revisión: 2026-06-06.*
