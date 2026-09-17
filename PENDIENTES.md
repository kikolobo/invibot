# Pendientes

Lo que quedó a medias, con lo suficiente para retomarlo sin reconstruir el
contexto. Cuando algo se termine, bórralo de aquí — esta lista sólo sirve si
refleja la verdad.

Última actualización: 2026-09-17

---

## 0. Número real — **prendido**. Falta probar la tarjeta y el pase

Desde el 2026-09-17 `invibot.com` manda por el número real. Local también: los
dos perfiles apuntan a producción, así que **cualquier envío desde la laptop
sale por el número real y le cuesta a Meta**. Fue decisión de Francisco; no hay
red de seguridad en desarrollo.

| | |
|---|---|
| Número | `+1 619-304-5456` |
| Phone number id | `1317996261394909` |
| WABA | `150259448162128` «InviBot.com» |
| Plantillas | 8 de 8 aprobadas |

⚠️ El mismo número aparece dos veces en Meta. El id viejo `135995746264538`
(WABA `154263271092631`, el que estaba en Twilio) sigue diciendo `CONNECTED` y
**no es el que se usa**.

**Lo único que falta probar:** la confirmación completa — tarjeta e invitación
de acceso. La prueba del 2026-09-17 llegó hasta la respuesta libre del
asistente: salieron la invitación y una respuesta `custom`, las dos por el
número nuevo, pero nunca se tocó el botón «Sí, ahí estaré», así que
`deliverConfirmation` no corrió. Se nota en que `events.card_media_phone_number_id`
todavía dice `140921972434962`, el número de prueba.

Hay que confirmar desde el celular y verificar que lleguen los tres: texto de
confirmación, tarjeta y pase QR. Importa porque **ese camino falla en
silencio** a propósito — al invitado nunca se le avisa que su tarjeta no salió.
La tarjeta se vuelve a subir sola la primera vez, y al terminar
`card_media_phone_number_id` debe decir `1317996261394909`.

Para volver al número de prueba, si alguna vez hace falta: se borra
`WHATSAPP_PROFILE` de Vercel y se redespliega. Sin esa variable el perfil es
`test`.

---

## 1. Quitar «Responde BAJA» de las plantillas del WABA de *prueba*

Sólo aplica al WABA de prueba. Las de producción nacieron con el pie correcto,
así que esto ya no bloquea nada — es limpieza.

El código ya no tiene esa línea: las ocho plantillas llevan únicamente
`Powered by InviBot.com`. Falta empujarlo a Meta, que rechazó la edición porque
sólo permite **una edición por plantilla cada 24 horas** y las ocho se editaron
el 2026-09-17 entre las 10:29 y 10:33 UTC.

**Se puede reintentar a partir del 2026-09-18, 10:35 UTC** (04:35 hora de
Monterrey).

```
npx tsx --env-file=.env.local scripts/update-whatsapp-templates.mts --profile test --apply
npx tsx --env-file=.env.local scripts/whatsapp-template-status.mts --profile test
```

Antes de correrlo, verifica si ya se hizo. El 2026-09-17 el status mostraba la
edición aplicada sólo en tres —`consulta_organizador`, `confirmacion_rsvp` y
`recordatorio_evento`— y las otras cinco todavía con la línea vieja, así que la
tanda anterior pasó a medias.

⚠️ **Al editarlas entran en revisión, y una plantilla en revisión no se puede
mandar** (error `132001`). El 2026-09-17 eso costó un envío fallido. No lo
corras si esa mañana vas a mandar invitaciones.

---

## 2. Limpiar el campo Ciudad de «Creatures of the Night»

Dice `San Pedro, Garza Garcia` — con coma. Eso parte el municipio en dos
pedazos y estorba al geocodificador: Google resuelve la dirección sin ese
formato y falla con él. Debería decir `San Pedro Garza García`.

Se edita en `/eventos/[id]/editar`. Al guardar se vuelven a resolver las
coordenadas solas.

---

## 3. `GOOGLE_MAPS_API_KEY` — decisión de Francisco

Hoy las coordenadas del pin nativo de WhatsApp se sacan raspando la página de
embed que Google sirve para una dirección. Funciona, pero es un formato no
documentado: el día que Google lo cambie, el pin se degrada en silencio a
Nominatim, que para este venue quedó **818 metros** fuera.

Con la llave es determinista y gratis a este volumen (~10 mil búsquedas al mes;
nosotros hacemos una por evento guardado). `lib/events/geo.ts` ya la prefiere si
aparece en el entorno — no hay que tocar código.

**Lo tiene que hacer Francisco:** crear el proyecto en Google Cloud con billing
activado, sacar la llave, y ponerla en Vercel como `GOOGLE_MAPS_API_KEY`.

---

## 4. Campo «Link de Google Maps» — decisión de diseño

Lo agregué sin que nadie lo pidiera y a Francisco le pareció de más. El camino
normal ya es automático (dirección → link → `invibot.com/m/{code}`); el campo
sólo sirve para dos cosas: corregir un pin que cayó mal, y darnos coordenadas
exactas sin pasar por un geocodificador.

Opciones: quitarlo, o esconderlo en una sección «Avanzado». Mi recomendación es
esconderlo — la única vez que se necesita es la vez que cien invitados
llegarían a la puerta equivocada.

---

## 5. Candado por conversación antes de listas grandes

Un invitado que manda tres mensajes seguidos produce tres corridas del asistente
en paralelo, cada una leyendo un hilo incompleto. Con un invitado de prueba no
se nota; con ochenta sí. Es lo que Inngest debe serializar por conversación.

No es opcional antes de la primera lista real de invitados.

---

## 6. Escalaciones duplicadas con respuestas contradictorias

Dos invitados preguntan lo mismo con otras palabras («¿puedo llevar a mi perro?»
/ «¿aceptan mascotas?») y se abren dos escalaciones. El anfitrión contesta una
de cada forma, y dos invitados reciben respuestas distintas a la misma pregunta.

Hoy se deduplica sobre la pregunta normalizada, lo que sólo atrapa las
repeticiones literales. Falta decidir el método: embeddings, una comprobación
con el modelo al momento de escalar, o dejarlo como está y que el anfitrión vea
las preguntas juntas.

---

## Terminado

- ~~Mapa embebido en Generales~~ — verificado por Francisco el 2026-09-17.
- ~~`SERVICES.md` desactualizado~~ — actualizado el 2026-09-17: WhatsApp,
  Anthropic, R2 y los dos geocodificadores ya reflejan la realidad.
