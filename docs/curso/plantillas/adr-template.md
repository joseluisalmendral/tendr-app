# ADR-{NNN} · {Título corto de la decisión}

> Decisión arquitectónica versionada. Cambios mayores requieren nuevo ADR que supersede a este.

---

## Estado

Aceptada / Propuesta / Superada por ADR-{XXX} / Deprecada

## Fecha

{YYYY-MM-DD}

## Contexto

Una o dos frases describiendo la situación que obliga a tomar una decisión. Sin marketing, sin justificación todavía.

## Decisión

Una frase corta con la decisión tomada. Si hace falta detalle, va en "Tradeoffs aceptados" y "Consecuencias".

## Alternativas consideradas

Lista compacta de las opciones reales evaluadas con una línea de tradeoff cada una.

| Opción | Tradeoff principal |
|---|---|
| {Opción 1} | {Pros / contras en una línea} |
| {Opción 2} | {Pros / contras en una línea} |
| {Opción elegida} | {Por qué gana} |

## Tradeoffs aceptados

Lo que se pierde al elegir esta opción. Explicito y honesto.

- {Tradeoff 1: qué capacidad o flexibilidad se sacrifica.}
- {Tradeoff 2}

## Consecuencias

Qué condiciona esta decisión en el resto del producto.

- Fases del caso afectadas: {F3, F6, F7, etc.}
- Restricciones operativas: {límites, dependencias}
- Camino de salida: {qué habría que hacer para revertir, coste estimado}

## Criterio de revisión

Bajo qué condiciones se reabre esta decisión. Sin este campo, la decisión se vuelve dogma.

- {Métrica que dispararía revisión}
- {Cambio externo que dispararía revisión}

## Referencias

- {URL de doc oficial 1}
- {URL de doc oficial 2}
- {ADR relacionado}

---

*ADR-{NNN}. Última revisión: {YYYY-MM-DD}.*
