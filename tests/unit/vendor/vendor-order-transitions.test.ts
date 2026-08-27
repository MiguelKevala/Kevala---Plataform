import { describe, expect, it } from "vitest";
import { canPerformVendorOrderAction } from "@/modules/vendor/domain/vendor-order-transitions";

describe("canPerformVendorOrderAction", () => {
  describe("confirm", () => {
    it("PENDING -> CONFIRMED permitido", () => {
      expect(canPerformVendorOrderAction("confirm", "PENDING")).toBe(true);
    });
    it("CONFIRMED -> CONFIRMED prohibido", () => {
      expect(canPerformVendorOrderAction("confirm", "CONFIRMED")).toBe(false);
    });
    it("REJECTED -> CONFIRMED prohibido", () => {
      expect(canPerformVendorOrderAction("confirm", "REJECTED")).toBe(false);
    });
    it("DELIVERED -> CONFIRMED prohibido", () => {
      expect(canPerformVendorOrderAction("confirm", "DELIVERED")).toBe(false);
    });
  });

  describe("reject", () => {
    it("PENDING -> REJECTED permitido", () => {
      expect(canPerformVendorOrderAction("reject", "PENDING")).toBe(true);
    });
    it("CONFIRMED -> REJECTED prohibido", () => {
      expect(canPerformVendorOrderAction("reject", "CONFIRMED")).toBe(false);
    });
    it("REJECTED -> REJECTED prohibido", () => {
      expect(canPerformVendorOrderAction("reject", "REJECTED")).toBe(false);
    });
    it("DELIVERED -> REJECTED prohibido", () => {
      expect(canPerformVendorOrderAction("reject", "DELIVERED")).toBe(false);
    });
  });

  describe("deliver", () => {
    it("CONFIRMED -> DELIVERED permitido", () => {
      expect(canPerformVendorOrderAction("deliver", "CONFIRMED")).toBe(true);
    });
    it("PENDING -> DELIVERED prohibido", () => {
      expect(canPerformVendorOrderAction("deliver", "PENDING")).toBe(false);
    });
    it("REJECTED -> DELIVERED prohibido", () => {
      expect(canPerformVendorOrderAction("deliver", "REJECTED")).toBe(false);
    });
    it("DELIVERED -> DELIVERED prohibido", () => {
      expect(canPerformVendorOrderAction("deliver", "DELIVERED")).toBe(false);
    });
  });
});
