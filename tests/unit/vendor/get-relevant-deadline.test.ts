import { describe, expect, it } from "vitest";
import { getRelevantDeadline } from "@/modules/vendor/get-relevant-deadline";

const confirmationDeadline = new Date("2026-09-01");
const deliveryDeadline = new Date("2026-09-15");

describe("getRelevantDeadline", () => {
  it("PENDING devuelve la fecha límite de confirmación", () => {
    expect(
      getRelevantDeadline({ status: "PENDING", confirmationDeadline, deliveryDeadline }),
    ).toBe(confirmationDeadline);
  });

  it("CONFIRMED devuelve la fecha límite de entrega", () => {
    expect(
      getRelevantDeadline({ status: "CONFIRMED", confirmationDeadline, deliveryDeadline }),
    ).toBe(deliveryDeadline);
  });

  it("REJECTED no tiene fecha límite relevante", () => {
    expect(
      getRelevantDeadline({ status: "REJECTED", confirmationDeadline, deliveryDeadline }),
    ).toBeNull();
  });

  it("DELIVERED no tiene fecha límite relevante", () => {
    expect(
      getRelevantDeadline({ status: "DELIVERED", confirmationDeadline, deliveryDeadline }),
    ).toBeNull();
  });

  it("PENDING sin fecha límite de confirmación devuelve null", () => {
    expect(
      getRelevantDeadline({ status: "PENDING", confirmationDeadline: null, deliveryDeadline }),
    ).toBeNull();
  });
});
