# 🧮 Plan del Calculador de Menú — Motor en GRAMOS (salado · dulce · torta · bebida)

> Idea de Lili (17/06/2026). Basado en los 13 eventos de MENU-DATOS-REALES.md + su experiencia.
> ESTADO: **lógica aprobada**. Faltan confirmar pocos números (dulce hombre/niño, gramos de dulces, ajuste de bebida por hora). NO tocar el calculador hasta el OK final.

---

# PARTE 1 — Cómo se ve en el Administrador de Alimentos (lo que pidió Lili)
Todo **editable**, para poder cambiar gramos y **agregar** alimentos.

## A) Gramos por persona (editable)
**SALADO** (comida fuerte) y **DULCE** son **independientes**: una persona come las dos cosas por separado.

| Persona | Salado | Dulce |
|---|---|---|
| 👩 Mujer | **450 g** ✅ | **200 g** ✅ |
| 👨 Hombre | **700 g** ✅ | **150 g** ✅ (no comen mucho dulce, ~como niños) |
| 🧒 Niño | **300 g** ✅ | **150 g** ✅ |

- **Torta:** está DENTRO del dulce → ~100 g por persona (1 porción). El resto del dulce (mujer: 200 − 100 = 100 g) se reparte entre las otras cosas dulces.
- **Bebida:** aparte → ver sección C.
- (Estos números son los de **comida completa**; en tarde/merienda el salado baja −20%.)

## B) Lista de alimentos (editable + se pueden agregar)
Cada alimento tiene: **tipo** (salado / dulce / de niño), **gramos por unidad** y **peso de gusto** (cuánto gusta).

SALADOS (adultos)
| Alimento | Gramos c/u | Gusto |
|---|---|---|
| Empanada (normal) | ~90 g | 3 (la estrella) |
| Empanada de copetín | ~45 g | 3 |
| Pizza / prepizza (porción) | ~90 g | 2 |
| Pebete / sánguche común | ~80 g | 2 |
| Sándwich de miga TRIPLE | ~25 g | 2 |
| Sándwich de miga SIMPLE | ~10 g | 2 |
| Pernil (sándwich) | ~80 g | especial (ver Parte 2) |
| Tarta salada (porción) | ~100 g | 1 |

DE NIÑO (los chicos comen distinto: mucho pancho/pizzeta, poca empanada)
| Alimento | Gramos c/u | Gusto |
|---|---|---|
| Pancho (armado) | ~90 g | 3 |
| Pizzeta | ~45 g | 3 |
| Hamburguesa | ~120 g | 3 |
| Sándwich de miga | ~25 g | 2 |
| Empanada j-y-q | ~90 g | 1 |

DULCES (gramos estimados, a confirmar)
| Alimento | Gramos c/u |
|---|---|
| Medialuna | ~40 g |
| Factura | ~50 g |
| Magdalena | ~30 g |
| Brownie (porción) | ~50 g |
| Masa fina | ~15 g |
| Palmerita | ~15 g |
| Alfajor de maicena | ~20 g |
| Pastafrola (porción) | ~80 g |

> Datos de compra útiles: salchichas viena x6 ≈ 190–225 g · pan de pancho x6 ≈ 210–350 g · hamburguesa = medallón 100 g + pan ≈ 120 g.

## C) Bebida (editable)
- **~1,5 L por persona** en un evento de **3 horas** (esta época / invierno; en verano más).
- Si el evento dura **más** (4–5 h) → subir **solo la bebida** un poco, NO la comida. Y **no proporcional**: ~**+0,2 L por persona por cada hora extra** (a confirmar).
  - 3 h → 1,5 L · 4 h → ~1,7 L · 5 h → ~1,9 L por persona.

---

# PARTE 2 — Cómo calcula (el motor)

## Lo que carga la mamá
👩 mujeres · 👨 hombres · 🧒 niños · horario (almuerzo/tarde/noche) · **duración** · qué platos lleva.

## Cartel de aviso (arriba)
> 📋 *Estas cantidades son una **guía orientativa**, en base a años de experiencia. El cálculo tiene en cuenta que un **hombre come más** que una **mujer** y que un **niño**; por eso te pedimos cuántos de cada uno vienen. Cada fiesta es distinta: tomalo como referencia.*

## Paso 1 — Gramos totales (salado y dulce, por separado)
> **Salado total = (mujeres×450 + hombres×700 + niños×300) × factor horario**
> **Dulce total = (mujeres×200 + hombres×150 + niños×150)**
- Factor horario (solo salado): almuerzo/noche = 1 (comida completa) · tarde/merienda = 0,8.
- Niños y adultos son "bolsas" separadas (los platos de niño se reparten los gramos de niño).

## Paso 2 — Repartir cada bolsa entre lo elegido (reforzando favoritos)
> **gramos de un plato = (gramos de su bolsa) × (gusto del plato ÷ suma de gustos de lo elegido de esa bolsa)**
> **unidades = gramos del plato ÷ gramos por unidad**

- La bolsa de **salado** se reparte entre los salados elegidos; la de **dulce** entre los dulces.
- Pocas variedades → mucho de cada una. Muchas → menos de cada una. El favorito siempre se lleva más.

## Paso 3 — Casos especiales
- **TORTA:** está dentro del dulce → reserva **~100 g por persona** (1 porción). El resto del dulce se reparte entre las otras cosas dulces. (Igual que el pernil con el salado.)
- **BEBIDA:** 1,5 L/persona/3 h + ajuste por duración (ver Parte 1-C). Aparte, NO depende de la comida.
- **PERNIL** (solo almuerzo/noche):
  - Cantidad: la decide el local donde se compra (cartel: *"consultá la cantidad en el local; ellos la arman; siempre sobra un poco"*).
  - Reserva **~160 g** del salado por persona (2 sandwichitos), así el resto no queda de más.
- **SNACKS salados** (papas, maní, chizitos): aparte, fijos → adulto ~26 g papas / ~12 g maní; niño ~15–20 g.

## Ejemplos (verificados con la experiencia de Lili)
**Mujer · cena con pernil · empanada + pizza** (salado 450, pernil reserva 160 → 290 para repartir; gusto emp 3 + pizza 2 = 5)
- Pernil → ~160 g (2 sandwichitos; cantidad la arma el local)
- Empanada = 290×3/5 = 174 g ÷ 90 = ~2 empanadas
- Pizza = 290×2/5 = 116 g ÷ 90 = ~1,3 porciones
→ ≈ 2 pernil + 2 empanadas + 1 pizza ✓

**Niño · pancho + pizzeta + miga** (de niño 300; gusto 3+3+2 = 8)
- Pancho = 300×3/8 = 112 ÷ 90 = ~1,2 panchos
- Pizzeta = 112 ÷ 45 = ~2,5 pizzetas
- Miga = 300×2/8 = 75 ÷ 25 = ~3 sandwichitos
→ ≈ 1-2 panchos + 2 pizzetas + sandwichitos ✓

## Cantidades (sin mínimos fijos)
Todo por unidad según la gente. Redondear a la unidad de compra: empanadas a la **docena**, pizza/pizzeta/pancho a la **unidad**, sánguches a la **docena/paquete**.

---

# Estado de las confirmaciones
1. ✅ Salado por persona: mujer 450 / hombre 700 / niño 300.
2. ✅ Horario (solo salado): tarde −20%; almuerzo y noche = comida completa. Mediodía = cena.
3. ✅ Pesos de gusto: empanada 3 / sánguche-miga-pizza 2 / tarta 1. Niño: pancho-pizzeta-hamburguesa 3 / miga 2 / empanada 1.
4. ✅ Pernil: local arma cantidad + reserva 160 g. Solo almuerzo/noche.
5. ✅ Se cargan mujeres/hombres/niños por separado (cálculo exacto).
6. ✅ Sin mínimo fijo: por unidad, redondeando a docena/unidad.
7. ✅ Gramos por plato salado: empanada 90 / copetín 45 / pizza 90 / pebete 80 / pernil 80 / pancho 90 / hamburguesa 120 / pizzeta 45 / miga triple 25 / miga simple 10 / tarta 100.
8. ✅ DULCE independiente del salado. Mujer 200 g (= torta 100 + otras dulces 100).
9. ✅ Dulce: mujer 200 / hombre 150 / niño 150. (Hombres y niños comen poco dulce.)
10. ✅ Gramos de cada dulce: medialuna 40 / factura 50 / magdalena 30 / brownie 50 / masa fina 15 / palmerita 15 / maicena 20 / pastafrola 80.
11. ✅ Torta DENTRO del dulce: reserva ~100 g/persona; el resto del dulce va a las otras cosas dulces.
12. ✅ Bebida ~1,5 L/persona/3 h (esta época); más horas = solo bebida.
13. ✅ Ajuste de bebida: +0,2 L/persona por hora extra (3h=1,5 · 4h=1,7 · 5h=1,9).
14. ✅ Admin editable + se pueden agregar alimentos (Parte 1). Todos los gramos/gustos/bebida son campos editables; cambios guardan desde la app (no se pisan).

> ✅ TODO CONFIRMADO → listo para programar en el calculador (admin → Menú de Alimentos).
> Ojo persistencia: cargar desde la app o con confirmación de Lili (si re-guarda el menú, pisa los cambios directos).
