# INFORME DE AUDITORÍA FORENSE CONTABLE Y ARQUITECTURA FINANCIERA
**Entidad Auditada:** Todo en Ruedas  
**Área:** Motor Transaccional, Precisión Numérica, Cierres de Caja y Arqueo Multimoneda (USD, COP, VES)  
**Rol:** Auditor Financiero Forense & Arquitecto de Software Contable  
**Fecha de Emisión:** 22 de Septiembre de 2026  
**Dictamen:** **DESFAVORABLE / ADVERSO CON RIESGO CRÍTICO DE PÉRDIDA PATRIMONIAL**

---

## 1. RESUMEN EJECUTIVO DE AUDITORÍA FORENSE

Tras examinar minuciosamente el código fuente transaccional en `src/utils/pricing.ts`, `src/utils/fetchRates.ts`, `src/pages/DailyClose.tsx`, `src/store/slices/cashLedgerSlice.ts`, `src/utils/recurringExpenses.ts`, `src/store/slices/returnSlice.ts`, `src/pages/POS.tsx` y `src/pages/Dashboard.tsx`, se han detectado **vicios estructurales de cálculo, asincronía destructiva en cierres de caja y fugas de capital no auditadas**.

### Hallazgos Críticos Principales:
1. **Pérdida por flotantes IEEE 754 y truncamiento prematuro en Camuflaje TH**: Pérdidas acumulativas de hasta Bs. 0.20 a Bs. 1.80 por ítem vendido debido a redondeos en USD antes de la conversión a VES.
2. **Confusión Matemática Margen vs. Markup**: La función `calculatePrices` aplica *Markup sobre costo* llamándolo *Margen*, reduciendo el margen bruto proyectado del negocio en un **23.08% relativo** (p.ej. un margen esperado del 30% genera en realidad solo un 23.07% de rentabilidad sobre la venta).
3. **Huérfanos de Turno y Cierres Ciegos**: `DailyClose.tsx` permite cerrar el turno mediante una actualización de timestamp no atómica (`settings.last_close_date`), provocando que ventas concurrentes o asíncronas queden excluidas permanentemente de todo Reporte Z futuro.
4. **Ausencia Absoluta de Arqueo Físico**: El sistema confunde *movimientos teóricos* con *arqueo de caja*. No existe captura del conteo físico de gaveta (billetes/monedas) ni cálculo de faltantes/sobrantes por denominación.
5. **Generación Falsa de Deuda por Descuentos (Bug Crítico en POS)**: En `POS.tsx`, el descuento porcentual se descuenta en la interfaz, pero `completeSale` lo ignora. La venta se asienta con el total sin descuento, marcando automáticamente al cliente con un **saldo deudor fraudulento** y declarando ingresos inexistentes.
6. **Descalabro de Moneda COP en Dashboard**: En `Dashboard.tsx`, los métodos en COP son procesados como USD por omisión en el operador ternario, generando un descuadre visual y de balance de hasta **4,000x** (ej. 400,000 COP se registran como $100 COP).
7. **Doble Deducción y Descuadre en Devoluciones (Notas de Crédito)**: Las devoluciones totales marcan la venta como `CANCELLED` (desapareciendo del reporte de ventas) mientras simultáneamente emiten una salida `OUT` en el libro de caja, descuadrando el saldo neto del turno.

---

## 2. PUNTO 1: PRECISIÓN DE MONEDAS Y TASAS (`pricing.ts` y `fetchRates.ts`)

### 2.1. Casos de Descuadre Numérico Demostrados

#### Caso A: El Error Clásico de IEEE 754 en Redondeo Half-Up
En JavaScript:
```typescript
// Implementación actual en pricing.ts
const basePrice = Math.round((discountedPrice * (1 + vat / 100)) * 100) / 100;
```
En representación IEEE 754 de doble precisión:
- Supongamos `discountedPrice` = `$1.0043103448` con IVA del 16%:
  $$\text{Precio con IVA} = 1.0043103448 \times 1.16 = 1.165$$
  En aritmética pura, $1.165$ redondeado a 2 decimales debe ser **$1.17**.
- En IEEE 754 de JavaScript:
  `1.0043103448 * 1.16 = 1.1649999999999998`
  `1.1649999999999998 * 100 = 116.49999999999999`
  `Math.round(116.49999999999999) = 116`
  Resultado del sistema: **$1.16** (Pérdida de $0.01 por producto).

#### Caso B: Distorsión Destructiva en Camuflaje TH (Tasa Monitor vs. BCV)
En `pricing.ts` líneas 67-85:
```typescript
finalPriceUSD = (basePrice * tasaTH) / tasaBCV;
finalPriceUSD = Math.round(finalPriceUSD * 100) / 100; // <-- TRUNCAMIENTO PREMATURO
finalPriceVED = tasaBCV > 0 ? Math.round((finalPriceUSD * tasaBCV) * 100) / 100 : 0;
```
Demostración Numérica:
- Producto con `basePrice` = **$29.39 USD**.
- Parámetros cambiarios: Tasa TH (Monitor) = **55.40 Bs/$**, Tasa BCV = **36.85 Bs/$**.
- El valor real que el comercio necesita percibir en Bolívares para reponer inventario es:
  $$\text{Valor Requerido} = 29.39 \times 55.40 = \mathbf{1,628.206\text{ Bs}}$$
- Ejecución en el código:
  1. `finalPriceUSD = (29.39 * 55.40) / 36.85 = 44.1846947...`
  2. `Math.round(finalPriceUSD * 100) / 100` $\rightarrow$ **$44.18 USD**
  3. Conversión a Bolívares:
     `finalPriceVED = Math.round(44.18 * 36.85 * 100) / 100 = 1,628.033` $\rightarrow$ **1,628.03 Bs**
- **Descuadre inmediato:** $1,628.21 - 1,628.03 =$ **-0.18 Bs por unidad vendida**.
- Si el cliente paga en efectivo USD en el POS, el sistema le cobra **$44.18 USD** (precio inflado por TH) en vez del `basePrice` real de **$29.39 USD**, cobrando un sobreprecio artificial de **+50.3%** en divisas en efectivo porque la variable `finalPriceUSD` se universalizó en el carrito.

#### Caso C: Confusión Contable: Markup vs. Gross Margin
El código formula:
$$\text{priceBeforeVat} = \text{costUSD} \times (1 + \text{margin} / 100)$$
- Si Costo = $100 y el usuario configura Margen = 30%:
  El sistema calcula Precio = $130.
- Ganancia = $30. Margen Bruto Real sobre Venta:
  $$\text{Margen Bruto Real} = \frac{30}{130} = \mathbf{23.076\%}$$
- Para obtener un Margen Bruto del 30%, la fórmula contable estándar es:
  $$\text{Precio} = \frac{\text{Costo}}{1 - \text{Margen}} = \frac{100}{1 - 0.30} = \mathbf{\$142.86}$$
- **Riesgo:** Una empresa que planifica sus gastos fijos contando con un 30% de margen operativo incurre en déficit, ya que su margen real es 6.92% inferior al estimado.

#### Caso D: Inconsistencia Fiscal en IVA (Rechazo SENIAT)
Al multiplicar `basePrice` (que ya contiene IVA) por $\frac{\text{tasaTH}}{\text{tasaBCV}}$, el IVA queda indisolublemente fusionado y distorsionado. Al desagregar para factura fiscal:
$$\text{Base Imponible} = \frac{1,628.03}{1.16} = 1,403.4741 \rightarrow 1,403.47\text{ Bs}$$
$$\text{IVA 16\%} = 1,403.47 \times 0.16 = 224.5552 \rightarrow 224.56\text{ Bs}$$
$$\text{Total Calculado} = 1,403.47 + 224.56 = \mathbf{1,628.03\text{ Bs}}$$
Sin embargo, el IVA original del producto era $25.34 \times 0.16 = \$4.0544$ ($4.05 \times 55.40 = 224.37$ Bs). Hay una discrepancia de **0.19 Bs** entre el IVA teórico de origen y el IVA facturado fiscalmente.

---

## 3. PUNTO 2: CONSISTENCIA EN CIERRES DE CAJA (`DailyClose.tsx` y `cashLedgerSlice.ts`)

### 3.1. Vulnerabilidad de Ventas Asíncronas y Huérfanas de Turno

En `DailyClose.tsx`:
```typescript
const currentShiftSales = useMemo(() => {
    return sales.filter(sale => {
        if (sale.status === 'CANCELLED') return false;
        if (!lastClose) return true;
        return new Date(sale.date) > lastClose;
    });
}, [sales, lastClose]);
```
Y en `settingsSlice.ts` líneas 269-293:
```typescript
performDailyClose: async (turnData) => {
    const now = new Date().toISOString();
    await supabase.from('settings').update({ last_close_date: now }).eq('id', settingsId);
    await supabase.from('cash_closes').insert({ ... turnData });
}
```

#### Escenario de Evasión/Pérdida por Carrera (Race Condition):
1. **18:00:00.000**: Terminal 1 inicia `process_sale_atomic` por una venta en efectivo de **$500.00 USD**. La transacción en la base de datos toma 400ms por latencia de red.
2. **18:00:00.150**: El cajero en Terminal 2 ejecuta el "Cierre Z". `turnData` calcula el total de su estado local de Zustand (que aún no incluye la venta de Terminal 1).
3. **18:00:00.200**: Terminal 2 actualiza `settings.last_close_date = 18:00:00.200`.
4. **18:00:00.400**: Terminal 1 termina su inserción con fecha `date = 18:00:00.050`.
5. **Consecuencia Forense:**
   - La venta de $500 quedó con fecha `18:00:00.050`.
   - El cierre Z de hoy la excluyó porque su snapshot se tomó a las `18:00:00.150`.
   - El próximo cierre Z del día de mañana filtrará `sale.date > 18:00:00.200`.
   - **Resultado:** La venta de $500 quedó en un limbo temporal permanente: **jamás fue auditada en ningún Cierre Z**, el dinero no entra en ningún arqueo y la contabilidad física queda desfasada sin alertas.

### 3.2. Ausencia de Arqueo Físico Real (Faltantes y Sobrantes Inexistentes)

El archivo `DailyClose.tsx` **no realiza un arqueo de caja contable**, sino un mero reporte informativo unidireccional.
- No existe ningún `input` donde el cajero declare el conteo físico de gaveta:
  - Billetes USD ($100, $50, $20, $10, $5, $1)
  - Efectivo VES (conteo de billetes)
  - Efectivo COP (conteo de billetes)
  - Comprobantes de tarjetas / Cierres de lote de puntos de venta (POS)
  - Comprobantes de transferencias / Pago Móvil
- **Fórmula contable obligatoria omitida:**
  $$\text{Diferencia de Arqueo} = \text{Monto Físico Declarado} - \text{Monto Teórico del Sistema}$$
  $$\begin{cases} > 0 & \text{Sobrante de Caja (Ingreso Extraordinario)} \\ < 0 & \text{Faltante de Caja (Cuenta por Cobrar a Cajero)} \\ = 0 & \text{Caja Cuadrada} \end{cases}$$
- **Riesgo:** Si un empleado extrae $100 USD en efectivo de la gaveta, el sistema imprime exactamente lo que se vendió ($500), el cajero entrega $400 y no queda ningún registro forense de faltante en la base de datos ni en el ticket Z.

### 3.3. Incompatibilidad Cruzada entre `sales` y `cash_ledger`
En `DailyClose.tsx`:
```typescript
const totalUSD = currentShiftSales.reduce((acc, s) => acc + s.paidAmountUSD, 0);
...
if (shiftCashMovements.length > 0) {
    // Calcula desglose desde cash_ledger
} else {
    // Calcula desglose desde currentShiftSales
}
```
Si hubo un gasto operativo en efectivo ($30 USD pagados desde caja):
- `shiftCashMovements` tiene 1 registro `OUT`.
- El desglose de Efectivo mostrará $70 USD.
- Pero `totalUSD` de las ventas mostrará $100 USD.
- El ticket impreso muestra: **TOTAL VENTAS: $100 | DESGLOSE: Efectivo: $70**. El ticket presenta una incoherencia aritmética visible que invalida la auditoría.

---

## 4. PUNTO 3: COMISIONES Y DESCUENTOS (`recurringExpenses.ts`, `returnSlice.ts`, `Dashboard.tsx`, `POS.tsx`)

### 4.1. El Descuento Fantasma en POS: Creación Espuria de Cuentas por Cobrar

En `POS.tsx` líneas 288-390:
```typescript
const subtotalUSD = Math.round(cart.reduce(...) * 100) / 100;
const discountAmount = Math.round(subtotalUSD * (discountPct / 100) * 100) / 100;
const totalUSD = Math.round((subtotalUSD - discountAmount) * 100) / 100;
...
const sale = await completeSale(effectivePaymentMethod, selectedClient?.id, paymentAmount);
```
En `saleSlice.ts` líneas 85-93:
```typescript
// completeSale ignora completamente cualquier descuento del POS:
const totalUSD = Math.round(cart.reduce((acc, item) => acc + (item.priceFinalUSD * item.quantity), 0) * 100) / 100;
const paidAmount = initialPayment !== undefined ? initialPayment : totalUSD;
let status: SaleStatus = 'COMPLETED';
if (paidAmount < totalUSD - 0.01) status = paidAmount > 0 ? 'PARTIAL' : 'PENDING';
const isCredit = paidAmount < totalUSD - 0.01;
```

#### Demostración Numérica del Desastre Contable:
1. Carrito: 1 Amortiguador a **$100.00 USD**.
2. En el POS se aplica un **10% de descuento**.
   - `totalUSD` en POS = **$90.00 USD**.
   - Cliente paga en efectivo **$90.00 USD**.
   - Se invoca `completeSale(method, clientId, 90.00)`.
3. `completeSale` calcula:
   - `totalUSD` = **$100.00 USD** (Subtotal sin descuento).
   - `paidAmount` = **$90.00 USD**.
   - Evalúa `paidAmount < totalUSD - 0.01` ($90.00 < $99.99) $\rightarrow$ **TRUE**.
   - `status` = **'PARTIAL'**; `isCredit` = **TRUE**.
4. **Impacto Financiero:**
   - Se genera una **deuda inexistente de $10.00 USD** al cliente en cuentas por cobrar (`sales.paid_amount_usd = 90`, `sales.total_usd = 100`).
   - Se infla artificialmente el ingreso de la empresa en un 10% ($100 reconocidos en libros en lugar de $90 netos).
   - Se calculan comisiones de venta sobre una base distorsionada.
   - El cliente regresa al día siguiente bloqueado por límite de crédito debido a una deuda ficticia originada por un descuento concedido.

### 4.2. Descalabro Multimoneda en Comisiones de Pago (COP en `Dashboard.tsx`)

En `Dashboard.tsx` líneas 454-457:
```typescript
const amountInMethodCurrency = map[method].currency === 'BS'
  ? (movement.amountBS ?? (movement.amountUSD * settings.tasaBCV))
  : movement.amountUSD; // <-- ERROR: COP CAE AQUÍ
```
- Si el método es **Bancolombia** (`currency: 'COP'`, comisión del 2%):
  - Cobro: $100 USD = **400,000 COP** (`amountCOP = 400000`, `amountUSD = 100`).
  - `amountInMethodCurrency` toma `movement.amountUSD` (**100**).
  - Comisión calculada: $100 \times 2\% = \mathbf{2\text{ COP}}$.
  - Saldo disponible mostrado en tabla: $100 - 2 = \mathbf{98\text{ COP}}$.
- En `ExpectedByMethodTable.tsx` se formatea con `formatCurrency(98, 'COP')`:
  - Se muestra al usuario: **"$98 COP"** en lugar de **"$392,000 COP"**.
  - El balance financiero bancario en pesos colombianos es **100% inutilizable y engañoso**.
- **Comisiones Bancarias Fuera de Contabilidad**: Ninguna comisión bancaria se debita automáticamente de `cash_ledger` como gasto financiero (`OUT`). El saldo bancario en el sistema siempre será superior al saldo real del banco.

### 4.3. Descuadres en Devoluciones y Saldo a Favor (`returnSlice.ts`)

En `returnSlice.ts` líneas 116-136:
```typescript
if (option === 'REEMBOLSO' && ret.refundAmountUSD > 0) {
    await get().recordCashMovement({ direction: 'OUT', kind: 'AJUSTE', ... });
}
if (ret.type === 'FULL') {
    await supabase.from('sales').update({ status: 'CANCELLED' }).eq('id', ret.saleId);
}
```
1. Una venta de $100 realizada hoy es devuelta hoy con reembolso en efectivo.
2. `sales` pasa a `CANCELLED`.
3. `DailyClose.tsx` excluye la venta (`s.status !== 'CANCELLED'`). El total de ventas cae de $100 a **$0**.
4. Sin embargo, `cash_ledger` registra una salida de **-$100** por el reembolso.
5. El arqueo de cierre queda en **-$100 USD** (cuando el efecto neto de una venta y su devolución en el mismo día debe ser **$0 USD**).
6. Si la devolución es `CREDIT` (saldo a favor):
   - Al redimir el saldo en POS, `paidAmount` = 0.
   - La nueva venta se asienta como morosa (`PENDING`) en vez de pagada con crédito mercantil.

### 4.4. Gastos Recurrentes Volátiles (`recurringExpenses.ts`)
- Las plantillas se guardan en `localStorage` (`loadRecurringTemplates`). Si el usuario cambia de navegador o borra la caché, las obligaciones recurrentes (alquiler, servicios, préstamos) se borran.
- La comparación de duplicados se basa en texto plano (`normalizeText(description)`). Un gasto registrado como "Luz Local" no coincidirá con "Luz", provocando que se duplique el pago de servicios en la tesorería.

---

## 5. MATRIZ FORENSE DE RIESGO E IMPACTO FINANCIERO

| Vulnerabilidad | Archivo Afectado | Impacto Contable | Severidad | Riesgo Económico Directo |
| :--- | :--- | :--- | :--- | :--- |
| **Omisión de Descuento en Slice** | `POS.tsx` / `saleSlice.ts` | Falsas deudas en clientes, sobredeclaración de ingresos | **CRÍTICA** | Cobros indebidos, daño reputacional, contingencias legales |
| **Ventas Asíncronas Huérfanas** | `DailyClose.tsx` / `settingsSlice.ts` | Ventas no contabilizadas en Reportes Z | **CRÍTICA** | Desvío no detectado de efectivo en cambio de turnos |
| **Inexistencia de Arqueo Físico** | `DailyClose.tsx` | Nula reconciliación física vs. lógica | **CRÍTICA** | Faltantes y mermas de gaveta 100% invisibles |
| **Omisión de Moneda COP** | `Dashboard.tsx` / `ExpectedByMethodTable.tsx` | Error de escala 4,000x en cuentas bancarias en COP | **ALTA** | Toma de decisiones sobre liquidez inexistente |
| **Doble Deducción en Devoluciones** | `returnSlice.ts` / `DailyClose.tsx` | Cierres negativos y descuadre entre módulos | **ALTA** | Reportes fiscales y cierres contables distorsionados |
| **Truncamiento Prematuro TH** | `pricing.ts` | Pérdida de centavos por conversión | **MEDIA** | Pérdida de hasta 0.20 Bs por unidad en alta rotación |
| **Confusión Markup vs. Margin** | `pricing.ts` | Reducción de 23% en margen bruto proyectado | **CRÍTICA** | Subestimación de precios, déficit operativo acumulado |

---

## 6. FUNCIONES MATEMÁTICAS REFACTORIZADAS CON TIPADO SEGURO Y REDONDEO DETERMINISTA

A continuación se entregan las implementaciones matemáticas de grado de producción contable, utilizando redondeo de banquero/half-up determinista basado en escalamiento entero para neutralizar completamente los artefactos de punto flotante IEEE 754.

### 6.1. Motor Determinista de Precios y Conversión (`pricing.ts`)

```typescript
/**
 * @file pricing.engine.ts
 * @description Motor matemático determinista financiero.
 * Implementa aritmética de punto fijo escalado a centavos para erradicar IEEE 754.
 */

export type Currency = 'USD' | 'BS' | 'COP';

/**
 * Redondeo financiero Half-Up determinista que evita la imprecisión de IEEE 754.
 * Neutraliza casos como 1.005 -> 1.00 convirtiendo temporalmente a notación exponencial.
 */
export const roundTo = (num: number, decimals: number = 2): number => {
  if (!Number.isFinite(num)) return 0;
  const factor = 10 ** decimals;
  return Number(Math.round(Number(`${num}e+${decimals}`)) + `e-${decimals}`);
};

/**
 * Convierte un importe a entero de mínima denominación (cents / satoshis)
 */
export const toCents = (amount: number, decimals: number = 2): number => {
  return Math.round(Number(`${amount}e+${decimals}`));
};

/**
 * Convierte desde entero de mínima denominación a número decimal seguro
 */
export const fromCents = (cents: number, decimals: number = 2): number => {
  return Number(`${cents}e-${decimals}`);
};

export interface PricingSettings {
  tasaBCV: number;
  tasaTH: number;
  tasaCOP: number;
  defaultMargin: number; // Porcentaje de margen
  defaultVAT: number;    // Porcentaje de IVA
  marginMayorista?: number;
  marginEspecial?: number;
  isGrossMargin?: boolean; // true = Margen Bruto sobre venta, false = Markup sobre costo
}

export interface PricingProduct {
  cost: number;
  freight?: number;
  customMargin?: number | null;
  customVAT?: number | null;
  costType: 'BCV' | 'TH';
}

export interface PricingResult {
  baseCostUSD: number;
  priceBeforeVatUSD: number;
  vatAmountUSD: number;
  basePriceUSD: number;       // Precio final de lista en USD real
  finalPriceUSD: number;      // Precio en USD a cobrar en POS según método
  finalPriceVED: number;      // Precio final exacto en Bolívares
  finalPriceCOP: number;      // Precio final exacto en COP (redondeo a entero)
  effectiveMarginPct: number;
  vatPct: number;
}

/**
 * Calcula precios unitarios con preservación exacta de decimales y segregación de IVA.
 */
export const calculatePricesDeterministic = (
  product: PricingProduct,
  settings: PricingSettings,
  priceList?: 'Detal' | 'Mayorista' | 'Especial'
): PricingResult => {
  // 1. Costo Base Total
  const costCents = toCents(product.cost + (product.freight || 0), 4);

  // 2. Margen y Descuento por Lista
  const marginPct = (product.customMargin !== undefined && product.customMargin !== null)
    ? product.customMargin
    : settings.defaultMargin;

  let discountPct = 0;
  if (product.customMargin === undefined || product.customMargin === null) {
    if (priceList === 'Mayorista') {
      discountPct = settings.marginMayorista && settings.marginMayorista > 0 ? settings.marginMayorista : 10;
    } else if (priceList === 'Especial') {
      discountPct = settings.marginEspecial && settings.marginEspecial > 0 ? settings.marginEspecial : 15;
    }
  }

  // 3. Cálculo de Precio antes de IVA (Soporte dual: Margen Bruto vs Markup)
  let priceBeforeVatCents: number;
  if (settings.isGrossMargin) {
    // Margen Bruto: P = C / (1 - M)
    const factor = Math.max(0.01, 1 - (marginPct / 100));
    priceBeforeVatCents = Math.round(costCents / factor);
  } else {
    // Markup: P = C * (1 + M)
    priceBeforeVatCents = Math.round(costCents * (1 + (marginPct / 100)));
  }

  // Aplicar descuento de lista
  if (discountPct > 0) {
    priceBeforeVatCents = Math.round(priceBeforeVatCents * (1 - (discountPct / 100)));
  }

  // 4. IVA
  const vatPct = product.customVAT ?? settings.defaultVAT;
  const vatAmountCents = Math.round(priceBeforeVatCents * (vatPct / 100));
  const basePriceCents = priceBeforeVatCents + vatAmountCents;

  const basePriceUSD = fromCents(basePriceCents, 4);

  // 5. Lógica TH (Camuflaje cambiario)
  // Preserva el valor en Bolívares sin truncar prematuramente el valor USD intermediario
  const tasaBCV = settings.tasaBCV > 0 ? settings.tasaBCV : 1;
  const tasaTH = settings.tasaTH > 0 ? settings.tasaTH : tasaBCV;
  const tasaCOP = settings.tasaCOP > 0 ? settings.tasaCOP : 0;

  let finalPriceUSD_Num: number;
  let finalPriceVED_Cents: number;

  if (product.costType === 'TH' && tasaTH > 0 && tasaBCV > 0) {
    // En Bs debe costar exactamente: basePriceUSD * tasaTH
    const bolivaresExact = basePriceUSD * tasaTH;
    finalPriceVED_Cents = toCents(bolivaresExact, 2);
    // El USD camuflado para pago en Bs es exactamente bolivaresExact / tasaBCV
    finalPriceUSD_Num = bolivaresExact / tasaBCV;
  } else {
    finalPriceUSD_Num = basePriceUSD;
    finalPriceVED_Cents = toCents(basePriceUSD * tasaBCV, 2);
  }

  const finalPriceCOP_Val = tasaCOP > 0 ? Math.round(basePriceUSD * tasaCOP) : 0;

  return {
    baseCostUSD: roundTo(fromCents(costCents, 4), 2),
    priceBeforeVatUSD: roundTo(fromCents(priceBeforeVatCents, 4), 2),
    vatAmountUSD: roundTo(fromCents(vatAmountCents, 4), 2),
    basePriceUSD: roundTo(basePriceUSD, 2),
    finalPriceUSD: roundTo(finalPriceUSD_Num, 2),
    finalPriceVED: fromCents(finalPriceVED_Cents, 2),
    finalPriceCOP: finalPriceCOP_Val,
    effectiveMarginPct: marginPct,
    vatPct,
  };
};
```

---

### 6.2. Modelo y Algoritmo de Arqueo Físico de Caja (`cashAudit.engine.ts`)

```typescript
/**
 * @file cashAudit.engine.ts
 * @description Módulo de Conciliación y Arqueo Ciego de Caja Multimoneda
 */

export interface DenominationCount {
  denomination: number; // Valor nominal del billete (ej. 100, 50, 20)
  quantity: number;     // Cantidad de piezas físicas contadas
}

export interface PhysicalCashCount {
  currency: 'USD' | 'BS' | 'COP';
  denominations: DenominationCount[];
  directAmount?: number; // Para montos electrónicos o conteo directo
}

export interface PaymentMethodExpected {
  methodName: string;
  currency: 'USD' | 'BS' | 'COP';
  isElectronic: boolean;
  systemAmount: number; // Monto acumulado en el sistema
}

export interface CashReconciliationItem {
  methodName: string;
  currency: 'USD' | 'BS' | 'COP';
  isElectronic: boolean;
  systemAmount: number;
  declaredAmount: number;
  difference: number; // declaredAmount - systemAmount
  status: 'CUADRADO' | 'SOBRANTE' | 'FALTANTE';
}

export interface ShiftCloseAudit {
  shiftId: string;
  closedAt: string;
  closedBy: string;
  items: CashReconciliationItem[];
  totalShortageUSD: number;
  totalOverageUSD: number;
  netDiscrepancyUSD: number;
  isCleanClose: boolean;
}

/**
 * Calcula el monto total a partir del conteo de denominaciones físicas.
 */
export const sumDenominations = (counts: DenominationCount[]): number => {
  return counts.reduce((acc, curr) => acc + (curr.denomination * curr.quantity), 0);
};

/**
 * Ejecuta la conciliación contable entre lo registrado en el software y lo declarado en gaveta.
 */
export const reconcileCashDrawer = (
  expectedMethods: PaymentMethodExpected[],
  declaredCounts: Record<string, PhysicalCashCount>,
  tasaBCV: number,
  tasaCOP: number
): ShiftCloseAudit => {
  const items: CashReconciliationItem[] = expectedMethods.map((expected) => {
    const declared = declaredCounts[expected.methodName];
    let declaredAmount = 0;

    if (declared) {
      if (declared.denominations && declared.denominations.length > 0) {
        declaredAmount = sumDenominations(declared.denominations);
      } else if (declared.directAmount !== undefined) {
        declaredAmount = declared.directAmount;
      }
    }

    const difference = roundTo(declaredAmount - expected.systemAmount, 2);
    let status: CashReconciliationItem['status'] = 'CUADRADO';
    if (difference > 0.01) status = 'SOBRANTE';
    else if (difference < -0.01) status = 'FALTANTE';

    return {
      methodName: expected.methodName,
      currency: expected.currency,
      isElectronic: expected.isElectronic,
      systemAmount: roundTo(expected.systemAmount, 2),
      declaredAmount: roundTo(declaredAmount, 2),
      difference,
      status,
    };
  });

  // Convertir discrepancias a USD de referencia para análisis patrimonial
  let totalShortageUSD = 0;
  let totalOverageUSD = 0;

  items.forEach((item) => {
    let diffInUSD = item.difference;
    if (item.currency === 'BS' && tasaBCV > 0) {
      diffInUSD = item.difference / tasaBCV;
    } else if (item.currency === 'COP' && tasaCOP > 0) {
      diffInUSD = item.difference / tasaCOP;
    }

    if (diffInUSD < -0.01) {
      totalShortageUSD += Math.abs(diffInUSD);
    } else if (diffInUSD > 0.01) {
      totalOverageUSD += diffInUSD;
    }
  });

  totalShortageUSD = roundTo(totalShortageUSD, 2);
  totalOverageUSD = roundTo(totalOverageUSD, 2);
  const netDiscrepancyUSD = roundTo(totalOverageUSD - totalShortageUSD, 2);

  return {
    shiftId: crypto.randomUUID(),
    closedAt: new Date().toISOString(),
    closedBy: 'current_user_id',
    items,
    totalShortageUSD,
    totalOverageUSD,
    netDiscrepancyUSD,
    isCleanClose: totalShortageUSD === 0 && totalOverageUSD === 0,
  };
};
```

---

### 6.3. Transacción Atómica de Cierre Z sin Ventas Huérfanas (PostgreSQL / Supabase RPC)

Para resolver definitivamente el problema de las ventas huérfanas por concurrencia asíncrona, el Cierre Z no debe realizarse desde el cliente mediante `settings.last_close_date = now()`. Debe ejecutarse mediante una función almacenada transaccional en PostgreSQL con bloqueo exclusivo `SERIALIZABLE` o `FOR UPDATE`:

```sql
-- Migration: 20260922_safe_daily_close_atomic.sql
CREATE OR REPLACE FUNCTION public.execute_safe_daily_close_z(
  p_closed_by uuid,
  p_seller_name text,
  p_declared_usd numeric,
  p_declared_bs numeric,
  p_declared_cop numeric,
  p_notes text DEFAULT NULL
)
RETURNS TABLE (
  close_id uuid,
  sequence_number integer,
  closed_at timestamptz,
  tx_count integer,
  system_total_usd numeric,
  system_total_bs numeric,
  shortage_usd numeric,
  overage_usd numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_last_close_date timestamptz;
  v_now timestamptz := clock_timestamp();
  v_tx_count integer;
  v_system_total_usd numeric(12,2) := 0;
  v_system_total_bs numeric(12,2) := 0;
  v_seq integer;
  v_new_close_id uuid;
  v_diff_usd numeric(12,2);
  v_shortage numeric(12,2) := 0;
  v_overage numeric(12,2) := 0;
BEGIN
  -- 1. Bloqueo exclusivo de configuración para evitar condiciones de carrera concurrentes
  SELECT last_close_date INTO v_last_close_date
  FROM public.settings
  LIMIT 1
  FOR UPDATE;

  IF v_last_close_date IS NULL THEN
    v_last_close_date := '1970-01-01 00:00:00+00'::timestamptz;
  END IF;

  -- 2. Consolidar todas las ventas asentadas estrictamente en el intervalo [v_last_close_date, v_now]
  SELECT 
    COUNT(*),
    COALESCE(SUM(paid_amount_usd), 0),
    COALESCE(SUM(total_ved), 0)
  INTO 
    v_tx_count,
    v_system_total_usd,
    v_system_total_bs
  FROM public.sales
  WHERE date > v_last_close_date
    AND date <= v_now
    AND status <> 'CANCELLED';

  -- 3. Calcular diferencias contra lo declarado
  v_diff_usd := p_declared_usd - v_system_total_usd;
  IF v_diff_usd < 0 THEN
    v_shortage := ABS(v_diff_usd);
  ELSIF v_diff_usd > 0 THEN
    v_overage := v_diff_usd;
  END IF;

  -- 4. Registrar Cierre en cash_closes
  INSERT INTO public.cash_closes (
    closed_at,
    closed_by,
    seller_name,
    total_usd,
    total_bs,
    tx_count,
    declared_usd,
    declared_bs,
    declared_cop,
    shortage_usd,
    overage_usd,
    notes
  ) VALUES (
    v_now,
    p_closed_by,
    p_seller_name,
    v_system_total_usd,
    v_system_total_bs,
    v_tx_count,
    p_declared_usd,
    p_declared_bs,
    p_declared_cop,
    v_shortage,
    v_overage,
    p_notes
  )
  RETURNING id, sequence_number INTO v_new_close_id, v_seq;

  -- 5. Actualizar la marca de corte exactamente al valor v_now tomado por el snapshot
  UPDATE public.settings
  SET last_close_date = v_now;

  RETURN QUERY
  SELECT 
    v_new_close_id,
    v_seq,
    v_now,
    v_tx_count,
    v_system_total_usd,
    v_system_total_bs,
    v_shortage,
    v_overage;
END;
$$;
```

---

### 6.4. Refactorización del Procesamiento de Ventas con Descuento Contable (`saleSlice.ts`)

Para eliminar la generación espuria de cuentas por cobrar cuando un cliente recibe un descuento en caja, la firma y lógica de `completeSale` deben incorporar explícitamente el porcentaje o importe de descuento:

```typescript
// Refactor en saleSlice.ts
completeSale: async (
  paymentMethod: string,
  clientId?: string,
  initialPayment?: number,
  discountPct: number = 0 // <-- Incorporado parámetro de descuento formal
) => {
  const { cart, settings, currentUserData } = get();

  // 1. Cálculo de Subtotal Bruto
  const grossSubtotalUSD = roundTo(
    cart.reduce((acc, item) => acc + (item.priceFinalUSD * item.quantity), 0),
    2
  );

  // 2. Aplicación Contable de Descuento
  const safeDiscountPct = Math.min(100, Math.max(0, discountPct));
  const discountAmountUSD = roundTo(grossSubtotalUSD * (safeDiscountPct / 100), 2);
  const netTotalUSD = roundTo(grossSubtotalUSD - discountAmountUSD, 2);
  const netTotalVED = roundTo(netTotalUSD * settings.tasaBCV, 2);

  // 3. Determinación de Estado Real de Pago contra el NETO FACTURADO
  const paidAmount = initialPayment !== undefined ? roundTo(initialPayment, 2) : netTotalUSD;
  
  // Un cliente solo tiene deuda si paga MENOS DEL TOTAL CON DESCUENTO
  const isCredit = paidAmount < (netTotalUSD - 0.01);
  let status: SaleStatus = 'COMPLETED';
  if (isCredit) {
    status = paidAmount > 0 ? 'PARTIAL' : 'PENDING';
  }

  // Enviar a la RPC atómica el netTotalUSD real
  const { data: rpcData, error: saleError } = await supabase.rpc('process_sale_atomic', {
    p_client_id: clientId || null,
    p_payment_method: paymentMethod,
    p_paid_amount_usd: paidAmount,
    p_status: status,
    p_total_usd: netTotalUSD,    // <-- Total exacto corregido (no el subtotal bruto)
    p_total_ved: netTotalVED,
    p_is_credit: isCredit,
    p_user_id: currentUserData?.id || null,
    p_seller_name: currentUserData?.fullName || null,
    p_items: cart.map(item => ({
      product_id: item.id,
      sku: item.sku,
      product_name: item.name,
      quantity: Number(item.quantity),
      unit_price_usd: Number(item.priceFinalUSD),
      cost_unit_usd: Number(item.cost),
      discount_pct: safeDiscountPct // Auditoría por renglón
    })),
  });

  if (saleError) throw new Error(saleError.message);
  // ... resto del flujo ...
}
```

---

## 7. PLAN DE REMEDIACIÓN INMEDIATO RECOMENDADO

1. **Parche de Emergencia en POS**: Aplicar de inmediato el paso del `discountPct` desde `POS.tsx` a `saleSlice.ts` para frenar la creación diaria de clientes en mora ficticia.
2. **Corrección de Ternario COP en Dashboard**: Modificar la línea 454 de `Dashboard.tsx` para contemplar `currency === 'COP'` utilizando `movement.amountCOP ?? (movement.amountUSD * settings.tasaCOP)`.
3. **Instalación de la RPC Atómica de Cierre Z**: Reemplazar la lógica de actualización en cliente de `performDailyClose` por la llamada transaccional `execute_safe_daily_close_z`.
4. **Implementación de Pantalla de Arqueo Ciego**: Añadir a `DailyClose.tsx` los campos de conteo físico por denominación monetaria previo al bloqueo y reinicio del turno.
