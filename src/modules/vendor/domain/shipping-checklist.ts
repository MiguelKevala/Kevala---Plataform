export const CARRIER_LABEL_TYPES = ["UPS", "OnTrac", "AMZX"] as const;
export type CarrierLabelType = (typeof CARRIER_LABEL_TYPES)[number];

export interface ShippingChecklistFields {
  tracking: string | null;
  carrierId: string | null;
  modeId: string | null;
  confirmationDeadline: Date | null;
  deliveryDeadline: Date | null;
  deliveryDate: Date | null;
  pickUpDate: Date | null;
  shipmentDate: Date | null;
  cartonLabels: boolean | null;
  bol: boolean | null;
  palletLabels: boolean | null;
  asn: boolean | null;
  carrierLabels: boolean | null;
  carrierLabelType: string | null;
  packingSlip: boolean | null;
  invoiceNumber: number | null;
}

/**
 * Única fuente de verdad para las reglas de Carrier Labels / BOL. Se aplican
 * SIEMPRE — en Create y en Edit — independientemente de si la orden está
 * completa: son combinaciones que nunca deben poder guardarse, sin importar
 * el estado de la orden. Representan la distinción operativa Trailer (BOL)
 * vs Truck (Carrier Labels) sin necesidad de un campo extra.
 *
 * Devuelve la lista de campos con problema (vacía si todo es consistente).
 */
export function validateShippingChecklistConsistency(
  fields: Pick<ShippingChecklistFields, "bol" | "carrierLabels" | "carrierLabelType">,
): string[] {
  const issues: string[] = [];

  if (fields.carrierLabels === true) {
    if (!fields.carrierLabelType) {
      issues.push("Carrier Label Type");
    }
  } else if (fields.carrierLabels === false) {
    if (fields.carrierLabelType) {
      issues.push("Carrier Label Type");
    }
    if (fields.bol !== true) {
      issues.push("BOL");
    }
  }

  return issues;
}

/**
 * Reglas de completitud requeridas exclusivamente para poder marcar una
 * orden como DELIVERED. Incluye siempre las reglas de consistencia de
 * arriba, más Carrier/Mode/Tracking, las 3 fechas operativas reales
 * (Delivery/Pick Up/Shipment Date — nunca calculadas automáticamente) y
 * Packing Slip/Invoice #. Devuelve la lista de campos faltantes/inválidos
 * (vacía si la orden está lista para entregarse).
 */
export function validateShippingChecklistCompleteness(fields: ShippingChecklistFields): string[] {
  const missing = new Set<string>();

  if (!fields.tracking || fields.tracking.trim() === "") missing.add("Tracking");
  if (!fields.carrierId) missing.add("Carrier");
  if (!fields.modeId) missing.add("Mode");
  if (fields.confirmationDeadline === null) missing.add("Confirmation Deadline");
  if (fields.deliveryDeadline === null) missing.add("Delivery Deadline");
  if (fields.deliveryDate === null) missing.add("Delivery Date");
  if (fields.pickUpDate === null) missing.add("Pick Up Date");
  if (fields.shipmentDate === null) missing.add("Shipment Date");
  if (fields.cartonLabels === null) missing.add("Carton Labels");
  if (fields.palletLabels === null) missing.add("Pallet Labels");
  if (fields.asn === null) missing.add("ASN");
  if (fields.bol === null) missing.add("BOL");
  if (fields.carrierLabels === null) missing.add("Carrier Labels");
  if (fields.packingSlip === null) missing.add("Packing Slip");
  if (fields.invoiceNumber === null) missing.add("Invoice #");

  for (const field of validateShippingChecklistConsistency(fields)) {
    missing.add(field);
  }

  return [...missing];
}
