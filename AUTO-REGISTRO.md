# Auto-registro

Los invitados se dan de alta solos, por WhatsApp, y el anfitrión sólo aprueba.
Hoy el anfitrión captura la lista a mano; esto le quita ese trabajo sin darle a
nadie una invitación que él no haya autorizado.

Especificación acordada el 2026-09-17. Nada de esto está construido todavía.

---

## Cómo se ve desde afuera

El anfitrión prende la función en **Generales** y ahí mismo copia un link.
Lo pega en sus grupos de WhatsApp. Quien lo abre cae en una conversación con
nuestro número, con el mensaje ya escrito y el cursor al final:

> Regístrame para el evento A7K2 de «Nombre del anfitrión». Mi nombre es:

Escribe su nombre, manda, y queda registrado **en estado pendiente**. No puede
confirmar asistencia ni preguntar nada hasta que el anfitrión lo apruebe.
Aprobado, recibe la invitación normal — la misma plantilla de siempre — y de
ahí en adelante todo funciona como con cualquier invitado.

## Por qué por WhatsApp y no por un formulario

Se consideró una página con nombre, teléfono y correo. Se descartó:

- **El teléfono queda verificado solo.** En un formulario alguien teclea un
  dígito mal y la falla es invisible y cara: la invitación le llega a un
  desconocido, el invitado real nunca se entera, y nadie lo descubre hasta la
  fiesta. Un número mal tecleado sigue siendo un número válido. Por WhatsApp el
  número *es* el remitente: ya viene canónico y sin adivinar `521` contra `52`.
- **Un toque en lugar de un formulario.** Y puede que ni el nombre haga falta:
  Meta manda `contacts[0].profile.name` en cada mensaje entrante.
- **El consentimiento es más fuerte y la respuesta es gratis.** Un mensaje
  entrante desde su propio número, con su `wamid` guardado, prueba más que una
  casilla marcada. Además abre la ventana de 24 horas, así que el acuse no
  cuesta nada ni necesita plantilla.

Sin correo. La columna `guests.email` se queda; este flujo no la escribe.

---

## Orden de evaluación

Esto importa tanto como la tabla. Cada compuerta gana y lo de abajo no corre.

1. **¿Hay una pregunta pendiente para este número?** → camino de respuesta.
   **Tiene que ir antes de `parseIntent`.** Si no, un «sí» a la pregunta del
   nombre se lee como confirmación de asistencia — justo lo que la aprobación
   existe para impedir.
2. **¿Trae un código de registro válido?** → camino de registro.
   **Tiene que ir antes de `resolveGuest`.** Si no, un invitado que ya existe
   en otro evento del mismo anfitrión y se registra al nuevo queda resuelto
   contra su fila vieja, y su mensaje se archiva en la conversación
   equivocada. No es un caso raro: el link se pega en grupos donde ya hay
   invitados de otros eventos.
3. Si no, sigue el flujo de siempre, sin cambios.

## Tabla de estados

### Compuerta 1 — el evento

| Condición | Respuesta | Efecto |
|---|---|---|
| Auto-registro apagado, cerrado o archivado | *El evento ya está cerrado. ¡Gracias!* | se registra el intento, no se crea invitado |

Apagar la función **no borra nada**: los pendientes siguen pendientes, sólo se
dejan de aceptar nuevos. Por eso contesta en vez de quedarse callado.

### Compuerta 2 — ya está en este evento

| Estado | Respuesta | Efecto |
|---|---|---|
| pendiente, mismo nombre | *Tu registro aún no está procesado…* | con freno |
| pendiente, otro nombre | *Veo que estás usando otro nombre. ¿Quieres que actualice tu registro con ese nombre?* | pregunta pendiente = NOMBRE_NUEVO |
| aprobado, sin confirmar | *Ya tienes tu invitación. ¿Confirmas tu asistencia?* | ninguno: ya está aprobado, aplica el vocabulario normal de RSVP |
| aprobado y confirmado | *¡Ya estás registrado!* | ninguno |
| rechazado | *(silencio)* | sólo se registra |
| dado de baja / suprimido | se registra como pendiente | ver «Bajas» abajo |

### Compuerta 3 — nuevo

| Mensaje | Respuesta | Efecto |
|---|---|---|
| código + nombre | *Gracias por tu registro para «evento», «fecha». ¡Save the Date! Pronto te enviaremos tu invitación oficial.* | crea invitado: pendiente, origen propio |
| código sin nombre | *Disculpa, ¿cuál es tu nombre completo?* | crea invitado pendiente con el nombre de perfil o un marcador; pregunta pendiente = NOMBRE |

### Compuerta 4 — contestando una pregunta

| Pregunta | Mensaje | Respuesta | Efecto |
|---|---|---|---|
| NOMBRE | parece nombre | Save the Date | guarda, limpia |
| NOMBRE | parece pregunta | vuelve a preguntar una vez | a la segunda, limpia y cae al comodín |
| NOMBRE_NUEVO | afirmativo | *Listo, actualicé tu nombre.* | actualiza, limpia |
| NOMBRE_NUEVO | negativo | *Perfecto, lo dejamos como está.* | limpia |
| NOMBRE_NUEVO | ninguno | comodín | limpia |

### Compuerta 5 — comodín

Pendiente y cualquier otra cosa → *Tu registro aún no está procesado. En cuanto
lo esté, te enviaremos tu invitación oficial.* Con freno, y **callado los
primeros minutos después del Save the Date**: contestarle «tu registro aún no
está procesado» a quien sólo dijo «gracias» se lee como un robot descompuesto.

---

## Textos

| Cuándo | Texto |
|---|---|
| Cuerpo del link | Regístrame para el evento «código» de «anfitrión». Mi nombre es: |
| Registro nuevo | Gracias por tu registro para «evento», «fecha». ¡Save the Date! Pronto te enviaremos tu invitación oficial. |
| Falta el nombre | Disculpa, ¿cuál es tu nombre completo? |
| Pendiente (comodín) | Tu registro aún no está procesado. En cuanto lo esté, te enviaremos tu invitación oficial. |
| Ya confirmó | ¡Ya estás registrado! |
| Aprobado sin confirmar | Ya tienes tu invitación. ¿Confirmas tu asistencia? |
| Nombre distinto | Veo que estás usando otro nombre. ¿Quieres que actualice tu registro con ese nombre? |
| Nombre actualizado | Listo, actualicé tu nombre. |
| Nombre sin cambiar | Perfecto, lo dejamos como está. |
| Evento cerrado | El evento ya está cerrado. ¡Gracias! |

---

## Datos

**Campo en `guests`, no una tabla aparte.** `conversations`, `messages`,
`sends` y `guest_passes` cuelgan de `guests.id`, y un pendiente **va a tener
conversación** — las compuertas 3 a 5 lo garantizan. Una tabla aparte obliga a
llaves foráneas nulas o a que sus mensajes caigan en `unmatched_inbound` y se
reconcilien después. Con un campo, aprobar es un `UPDATE`; con dos tablas es
copiar y borrar, que es donde se pierden filas. Y el índice único
`(evento, teléfono)` ya hace justo lo correcto: nadie se registra dos veces al
mismo evento, pero sí a dos eventos distintos.

⚠️ **La aprobación no va en `invite_status`.** Ese enum es la tubería de
entrega — `pending → queued → sent → …` — y lo escribe el webhook con los
estados de Meta. Si la aprobación vive ahí, la decisión del anfitrión y los
acuses de Meta escriben en el mismo campo y uno pisa al otro sin avisar.
La aprobación es otro eje: su propia columna, más algo que diga que el invitado
se dio de alta solo.

Hace falta además:

- En `events`: el interruptor de Generales y el **código**, alfanumérico con
  dígito verificador y **único a nivel global** — con varios eventos abiertos a
  la vez, el código es lo único que enruta un mensaje entrante. Con códigos
  puramente numéricos, un dígito perdido puede seguir siendo válido y registrar
  a alguien en la fiesta equivocada, en silencio.
- Dónde vive la pregunta pendiente por número, y que expire.
- El **número marcable** para armar el link. Hoy el entorno guarda
  `WHATSAPP_PROD_PHONE_NUMBER_ID`, que es el id interno de Meta y no sirve para
  un `wa.me`. Falta el número en sí.

⚠️ **17 archivos leen `guests`.** Con el campo, todos empiezan a contar
pendientes: los totales de la lista de eventos, los reportes, el CSV, la lista
de invitados. No es peligroso — el único lugar que gasta dinero es
`recipients.ts`, que ya es paso obligado para la vista previa y el envío — pero
hay que decidir **una vez y para todo** si «invitado» significa aprobado.

---

## Bajas

Alguien que ya había contestado BAJA se registra por el link. Se registra como
pendiente, el anfitrión ve claramente que esa persona se había dado de baja, y
**aprobarlo levanta la supresión sólo para ese evento**.

Un mensaje entrante desde su propio número es consentimiento nuevo, y más firme
que cualquier casilla. Sin esto la aprobación funciona, la invitación nunca sale
y nadie se entera: `deliver()` bloquea los números suprimidos.

## Casos raros

- **Mensajes que no son texto** (sticker, foto, audio): `text` viene nulo, así
  que toda comprobación de «parece un nombre» tiene que sobrevivirlo. Caen al
  comodín.
- **Dos personas, un teléfono.** «Mi nombre es: Ana y Luis» es **un** invitado,
  no dos. El anfitrión ajusta el acompañante al aprobar.
- **Cuarenta registros de un link reenviado.** Va a pasar el primer día. La
  pantalla de aprobación necesita aprobar en bloque desde el principio.
- **Pendientes cuando ya pasó el evento.** Silencio, y que salgan solos de la
  lista de pendientes.
- **El nombre del anfitrión en el link** sale del evento, no de la organización:
  dos eventos pueden tener anfitriones distintos.

## Lo que falta

La pantalla de aprobación no existe, y es donde el anfitrión realmente vive en
esta función. Es la mayor parte del trabajo.
