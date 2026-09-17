# Pendientes

Lo que quedó a medias, con lo suficiente para retomarlo sin reconstruir el
contexto. Cuando algo se termine, bórralo de aquí — esta lista sólo sirve si
refleja la verdad.

Última actualización: 2026-09-17

---

## 0. Pasar al número real — **esperando la revisión de Meta**

El código ya maneja los dos números a la vez y lo de Meta ya está hecho. Falta
sólo lo de Vercel, y que Meta apruebe.

Hecho el 2026-09-17:

- `WHATSAPP_PROFILE` elige entre `test` y `production`; sin variable, `test`
  (a propósito: un entorno despistado cae en el número que no cuesta nada).
- Las respuestas salen por el número al que el invitado escribió, no por el
  perfil activo. Un número que no reconocemos se guarda y no se contesta.
- Los media ids ya se guardan con el número que los creó
  (`events.card_media_phone_number_id`). Un handle del otro número sólo puede
  fallar, y en silencio.
- La app `InviBot` ya está suscrita al WABA de producción. Antes los webhooks
  de ese número iban únicamente a tres apps de Twilio. **Las de Twilio siguen
  ahí** — sólo se pueden quitar desde la consola de Twilio, nuestra app no
  puede borrar la suscripción de otra. Francisco dijo que ese número ya no hace
  nada en Twilio, así que conviene quitarlas para que no reciban copia.
- Las ocho plantillas ya se crearon en el WABA de producción. Nacieron con el
  pie correcto (`Powered by InviBot.com`), así que el pendiente #1 no aplica
  ahí.
- Las cinco variables nuevas ya están en Vercel (`WHATSAPP_TEST_*`,
  `WHATSAPP_PROD_*` y `WHATSAPP_PROFILE=test`) y el código ya está
  desplegado. `/api/health` confirma los dos números. Vercel las guardó como
  *sensitive*, así que no se pueden volver a leer desde el dashboard ni con
  `vercel env pull` — `/api/health` es la única forma de verificarlas.

Falta:

1. **Esperar a `consulta_organizador`.** Siete de las ocho ya quedaron
   `APPROVED` el mismo 2026-09-17; falta esa, que es la que le pregunta al
   anfitrión lo que un invitado preguntó. No está en el camino del invitado,
   pero sin ella una escalación se queda sin salir.
   `npx tsx --env-file=.env.local scripts/whatsapp-template-status.mts --profile production`
2. **Prender producción:** `WHATSAPP_PROFILE=production` en Vercel,
   redesplegar, y `/api/health` debe decir
   `WHATSAPP_SENDING_AS: number 135995746264538`. Para regresar, se borra la
   variable y se vuelve a desplegar: sin ella el perfil es `test`.
3. **Probar en vivo con un invitado de prueba** antes de cualquier lista real:
   una invitación, una respuesta libre, y que llegue la tarjeta (la primera vez
   se vuelve a subir sola, porque el handle viejo era del número de prueba).

⚠️ `code_verification_status` del número real dice `EXPIRED`. No parece
bloquear nada — está `CONNECTED`, `LIVE` y con calidad GREEN — pero si un envío
falla sin explicación, empieza por ahí.

⚠️ El número real es `+1 619-304-5456`, de San Diego. Francisco lo dio por
bueno por ahora: el costo lo fija el país de quien recibe, no el del remitente.

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
