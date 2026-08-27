export const CONFIRMATION_DEADLINE_OFFSET_DAYS = 2;
export const DELIVERY_DEADLINE_OFFSET_DAYS = 4;

/**
 * Suma días en espacio UTC (no local), para que el cálculo no dependa del
 * huso horario del navegador o del servidor. Consistente con cómo se
 * parsean/formatean las fechas "solo día" (type="date") en el resto del
 * proyecto (siempre vía toISOString().slice(0, 10)).
 */
function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * Única fuente de verdad para calcular Confirmation Deadline y Delivery
 * Deadline a partir de Order Date. Usada por UI (previsualización en vivo),
 * backend (createVendorOrder/editVendorOrder, autoridad real) y tests. Nunca
 * se capturan manualmente — ver decisión de negocio de esta fase.
 */
export function computeConfirmationDeadline(orderDate: Date): Date {
  return addUtcDays(orderDate, CONFIRMATION_DEADLINE_OFFSET_DAYS);
}

export function computeDeliveryDeadline(orderDate: Date): Date {
  return addUtcDays(orderDate, DELIVERY_DEADLINE_OFFSET_DAYS);
}
