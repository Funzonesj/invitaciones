# 🕒 Plan — App de Fichaje y Control de Horarios (Fun Zone + Play Point)

> App nueva, mismo stack que el salón (HTML single-file + React CDN + Supabase). Misma instancia Supabase, tablas nuevas con prefijo `fichaje_`. Archivo: `fichaje.html` (se sirve junto al salón en Vercel → `/fichaje.html`).

## Reglas de negocio CONFIRMADAS por Lili (2026-06-20)

### Lectura del PDF de horarios
Formato real (ver `horarios del 22.06 al 28.06.pdf`, Play Point). Por cada evento:
- Header de día: `DOW. DD/MM/YYYY`.
- Lista de **legajos** (números) apilados — cada empleado tiene su número fijo en el sistema de gestión (ej. Lorena=1).
- Línea `<Paquete> HH:MM - HH:MM` = paquete + **horario del evento**.
- Líneas `<Rol> - HH:MM` = rol + (hora de salida → **NO se usa**, se ignora).
- Los legajos mapean **en orden** a los roles (Cocinero, Mozo, Auxiliar, "Mozo 4 hs"…).
- **`ID No Asignado)` = puesto sin empleado → se IGNORA** (no se toma ni se muestra).
- Cliente `... (Madre)` y Festejado = informativos.
- Paquetes Play Point: `Point 1`, `Point 2`, `Point Extreme`. Fun Zone tiene su propio PDF (distinto, mismo manejo — pendiente).

### Hallazgos al comparar los 2 PDF (Play Point + Fun Zone) — confirmado 2026-06-20
- **Misma estructura** en ambos; solo cambian los paquetes:
  - **Play Point:** Point 1, Point 2, Point Extreme.
  - **Fun Zone:** Super Estrella, Estrella, Deluxe, Cumple Express.
- El **orden de los roles VARÍA** por evento (Cocinero/Mozo/Auxiliar en cualquier orden). El legajo[i] mapea al rol[i] **por posición** (NO por un orden fijo). → `rol_en_evento` sale de la posición en el PDF, no del rol habitual del empleado.
- **Un mismo empleado tiene distinto rol según el evento** (ej. legajo 14 es Mozo / Auxiliar / Cocinero en distintos días). Confirmado por Lili: se adaptan al puesto que se necesite.
- **Eventos de 1 sola línea:** cuando hay 1 solo empleado, el PDF puede aplanar todo en una línea (ej. `11 Cumple Express 09:30 - 12:00 Auxiliar - 13:00 ...`). El parser debe manejar bloque multilínea Y línea única.
- Variantes de rol: `Mozo 4 hs`, `Auxiliar 4 hs` (texto del rol tal cual).
- Legajos Fun Zone: 3, 11, 14, 15, 19, 22, 26. Play Point: 1, 2, 5, 31.
- El salón lo define quién sube el PDF (la encargada sube al suyo); igual se puede autodetectar por los nombres de paquete.

### Hora de entrada esperada (lo que SÍ importa)
- **Primer evento del día:** entrada = inicio del evento − **1 h 30 min** (limpieza/prep).
- **Segundo evento, empleado NUEVO** (no estuvo en el primero): entrada = inicio del 2º evento − **30 min**.
- **Segundo evento, MISMO empleado** (siguió del primero): NO hay nueva entrada, sigue de corrido.
- La hora de salida sale del **fichaje real** del empleado, no del PDF.

### Pagos
- Pago = **horas reales fichadas × valor hora individual** (cada empleado el suyo, solo lo edita el Super Admin).
- **Bonus por encuesta "Excelente":** $7.000 fijo **por empleado** que trabajó ese evento (no se divide). Se lee de la encuesta de la app del salón (misma Supabase).
- La dueña elige rango de fechas → suma horas×valor + bonuses.

### Fichaje (empleado)
- GPS dentro de radio configurable de la sucursal + foto + **reconocimiento facial** (face-api.js). Autentica por la CARA, no por el dispositivo (puede fichar desde el cel de un compañero).

## Estado de construcción
- [x] Esquema SQL (`fichaje-schema.sql`) — Lili lo corre 1 vez en Supabase.
- [ ] Esqueleto app: login + roles + navegación + dashboards.
- [ ] Sucursales (CRUD + GPS) · Empleados (CRUD + foto + valor hora + legajo).
- [ ] Horarios (PDF parser de ESTE formato + manual + editar/reemplazar).
- [ ] Fichaje (GPS + cámara + face-api).
- [ ] Pagos (rango + bonus encuestas + export PDF) · Alertas.

## ⚠️ Seguridad
Guarda **sueldos y datos de empleados** en la misma Supabase abierta. Endurecer ANTES de cargar sueldos reales (ver [INFORME-SEGURIDAD.md](INFORME-SEGURIDAD.md)).
