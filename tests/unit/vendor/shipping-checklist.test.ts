import { describe, expect, it } from "vitest";
import {
  validateShippingChecklistCompleteness,
  validateShippingChecklistConsistency,
  type ShippingChecklistFields,
} from "@/modules/vendor/domain/shipping-checklist";

const COMPLETE_FIELDS: ShippingChecklistFields = {
  tracking: "1Z999AA10123456784",
  carrierId: "carrier-1",
  modeId: "mode-1",
  confirmationDeadline: new Date("2026-01-03T00:00:00.000Z"),
  deliveryDeadline: new Date("2026-01-05T00:00:00.000Z"),
  deliveryDate: new Date("2026-01-04T00:00:00.000Z"),
  pickUpDate: new Date("2026-01-02T00:00:00.000Z"),
  shipmentDate: new Date("2026-01-01T00:00:00.000Z"),
  cartonLabels: true,
  bol: true,
  palletLabels: true,
  asn: true,
  carrierLabels: false,
  carrierLabelType: null,
  packingSlip: true,
  invoiceNumber: 12345,
};

describe("validateShippingChecklistConsistency", () => {
  it("Carrier Labels = No + BOL = Yes -> válido", () => {
    expect(
      validateShippingChecklistConsistency({ bol: true, carrierLabels: false, carrierLabelType: null }),
    ).toEqual([]);
  });

  it("Carrier Labels = No + BOL = No -> inválido", () => {
    expect(
      validateShippingChecklistConsistency({ bol: false, carrierLabels: false, carrierLabelType: null }),
    ).toContain("BOL");
  });

  it("Carrier Labels = No + BOL = null -> inválido", () => {
    expect(
      validateShippingChecklistConsistency({ bol: null, carrierLabels: false, carrierLabelType: null }),
    ).toContain("BOL");
  });

  it("Carrier Labels = Yes + UPS -> válido", () => {
    expect(
      validateShippingChecklistConsistency({ bol: null, carrierLabels: true, carrierLabelType: "UPS" }),
    ).toEqual([]);
  });

  it("Carrier Labels = Yes + OnTrac -> válido", () => {
    expect(
      validateShippingChecklistConsistency({ bol: null, carrierLabels: true, carrierLabelType: "OnTrac" }),
    ).toEqual([]);
  });

  it("Carrier Labels = Yes + AMZX -> válido", () => {
    expect(
      validateShippingChecklistConsistency({ bol: null, carrierLabels: true, carrierLabelType: "AMZX" }),
    ).toEqual([]);
  });

  it("Carrier Labels = Yes sin tipo -> inválido", () => {
    expect(
      validateShippingChecklistConsistency({ bol: null, carrierLabels: true, carrierLabelType: null }),
    ).toContain("Carrier Label Type");
  });

  it("Carrier Labels = No con UPS -> inválido", () => {
    expect(
      validateShippingChecklistConsistency({ bol: true, carrierLabels: false, carrierLabelType: "UPS" }),
    ).toContain("Carrier Label Type");
  });

  it("Carrier Labels = No con OnTrac -> inválido", () => {
    expect(
      validateShippingChecklistConsistency({ bol: true, carrierLabels: false, carrierLabelType: "OnTrac" }),
    ).toContain("Carrier Label Type");
  });

  it("Carrier Labels = No con AMZX -> inválido", () => {
    expect(
      validateShippingChecklistConsistency({ bol: true, carrierLabels: false, carrierLabelType: "AMZX" }),
    ).toContain("Carrier Label Type");
  });

  it("Carrier Labels = null (no capturado) -> nunca genera un issue por sí solo", () => {
    expect(
      validateShippingChecklistConsistency({ bol: null, carrierLabels: null, carrierLabelType: null }),
    ).toEqual([]);
  });
});

describe("validateShippingChecklistCompleteness", () => {
  it("orden completa y consistente -> sin campos faltantes", () => {
    expect(validateShippingChecklistCompleteness(COMPLETE_FIELDS)).toEqual([]);
  });

  it("Tracking faltante -> rechazado", () => {
    expect(validateShippingChecklistCompleteness({ ...COMPLETE_FIELDS, tracking: null })).toContain(
      "Tracking",
    );
  });

  it("Tracking vacío -> rechazado", () => {
    expect(validateShippingChecklistCompleteness({ ...COMPLETE_FIELDS, tracking: "   " })).toContain(
      "Tracking",
    );
  });

  it("Carrier faltante -> rechazado", () => {
    expect(validateShippingChecklistCompleteness({ ...COMPLETE_FIELDS, carrierId: null })).toContain(
      "Carrier",
    );
  });

  it("Mode faltante -> rechazado", () => {
    expect(validateShippingChecklistCompleteness({ ...COMPLETE_FIELDS, modeId: null })).toContain("Mode");
  });

  it("Carton Labels null -> rechazado", () => {
    expect(
      validateShippingChecklistCompleteness({ ...COMPLETE_FIELDS, cartonLabels: null }),
    ).toContain("Carton Labels");
  });

  it("BOL null -> rechazado", () => {
    expect(validateShippingChecklistCompleteness({ ...COMPLETE_FIELDS, bol: null })).toContain("BOL");
  });

  it("Pallet Labels null -> rechazado", () => {
    expect(
      validateShippingChecklistCompleteness({ ...COMPLETE_FIELDS, palletLabels: null }),
    ).toContain("Pallet Labels");
  });

  it("ASN null -> rechazado", () => {
    expect(validateShippingChecklistCompleteness({ ...COMPLETE_FIELDS, asn: null })).toContain("ASN");
  });

  it("Carrier Labels null -> rechazado", () => {
    expect(
      validateShippingChecklistCompleteness({ ...COMPLETE_FIELDS, carrierLabels: null }),
    ).toContain("Carrier Labels");
  });

  it("Carrier Labels = Yes sin tipo -> rechazado", () => {
    expect(
      validateShippingChecklistCompleteness({
        ...COMPLETE_FIELDS,
        carrierLabels: true,
        carrierLabelType: null,
      }),
    ).toContain("Carrier Label Type");
  });

  it("Carrier Labels = No + BOL = No -> rechazado", () => {
    expect(
      validateShippingChecklistCompleteness({ ...COMPLETE_FIELDS, carrierLabels: false, bol: false }),
    ).toContain("BOL");
  });

  it("Carrier Labels = No + BOL = Yes -> permitido", () => {
    expect(
      validateShippingChecklistCompleteness({ ...COMPLETE_FIELDS, carrierLabels: false, bol: true }),
    ).toEqual([]);
  });

  it("Carrier Labels = Yes + UPS -> permitido", () => {
    expect(
      validateShippingChecklistCompleteness({
        ...COMPLETE_FIELDS,
        carrierLabels: true,
        carrierLabelType: "UPS",
      }),
    ).toEqual([]);
  });

  it("Carrier Labels = Yes + OnTrac -> permitido", () => {
    expect(
      validateShippingChecklistCompleteness({
        ...COMPLETE_FIELDS,
        carrierLabels: true,
        carrierLabelType: "OnTrac",
      }),
    ).toEqual([]);
  });

  it("Carrier Labels = Yes + AMZX -> permitido", () => {
    expect(
      validateShippingChecklistCompleteness({
        ...COMPLETE_FIELDS,
        carrierLabels: true,
        carrierLabelType: "AMZX",
      }),
    ).toEqual([]);
  });

  it("false NUNCA se trata como si fuera 'missing' (false !== faltante)", () => {
    // Todos los binarios en false (una respuesta completa y válida), con
    // Carrier Labels=false exigiendo BOL=true por la regla de consistencia.
    const result = validateShippingChecklistCompleteness({
      ...COMPLETE_FIELDS,
      cartonLabels: false,
      palletLabels: false,
      asn: false,
      bol: true,
      carrierLabels: false,
    });
    expect(result).toEqual([]);
  });

  it("Confirmation Deadline null -> rechazado", () => {
    expect(
      validateShippingChecklistCompleteness({ ...COMPLETE_FIELDS, confirmationDeadline: null }),
    ).toContain("Confirmation Deadline");
  });

  it("Delivery Deadline null -> rechazado", () => {
    expect(
      validateShippingChecklistCompleteness({ ...COMPLETE_FIELDS, deliveryDeadline: null }),
    ).toContain("Delivery Deadline");
  });

  it("Delivery Date null -> rechazado", () => {
    expect(validateShippingChecklistCompleteness({ ...COMPLETE_FIELDS, deliveryDate: null })).toContain(
      "Delivery Date",
    );
  });

  it("Pick Up Date null -> rechazado", () => {
    expect(validateShippingChecklistCompleteness({ ...COMPLETE_FIELDS, pickUpDate: null })).toContain(
      "Pick Up Date",
    );
  });

  it("Shipment Date null -> rechazado", () => {
    expect(validateShippingChecklistCompleteness({ ...COMPLETE_FIELDS, shipmentDate: null })).toContain(
      "Shipment Date",
    );
  });

  it("Packing Slip null -> rechazado", () => {
    expect(validateShippingChecklistCompleteness({ ...COMPLETE_FIELDS, packingSlip: null })).toContain(
      "Packing Slip",
    );
  });

  it("Packing Slip = false -> permitido (false no es faltante)", () => {
    expect(
      validateShippingChecklistCompleteness({ ...COMPLETE_FIELDS, packingSlip: false }),
    ).toEqual([]);
  });

  it("Invoice # null -> rechazado", () => {
    expect(validateShippingChecklistCompleteness({ ...COMPLETE_FIELDS, invoiceNumber: null })).toContain(
      "Invoice #",
    );
  });
});
