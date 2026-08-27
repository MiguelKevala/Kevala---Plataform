import { describe, expect, it } from "vitest";
import { rejectVendorOrderSchema } from "@/modules/vendor/validation";

describe("rejectVendorOrderSchema", () => {
  it("acepta un motivo válido sin comentarios", () => {
    const result = rejectVendorOrderSchema.safeParse({ reason: "Stock insuficiente" });
    expect(result.success).toBe(true);
  });

  it("acepta motivo y comentarios válidos", () => {
    const result = rejectVendorOrderSchema.safeParse({
      reason: "Stock insuficiente",
      comments: "Cliente notificado por correo",
    });
    expect(result.success).toBe(true);
  });

  it("rechaza motivo ausente", () => {
    const result = rejectVendorOrderSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rechaza motivo vacío", () => {
    const result = rejectVendorOrderSchema.safeParse({ reason: "" });
    expect(result.success).toBe(false);
  });

  it("rechaza motivo compuesto solo de espacios", () => {
    const result = rejectVendorOrderSchema.safeParse({ reason: "   " });
    expect(result.success).toBe(false);
  });

  it("rechaza motivo que excede la longitud máxima", () => {
    const result = rejectVendorOrderSchema.safeParse({ reason: "a".repeat(501) });
    expect(result.success).toBe(false);
  });

  it("acepta motivo justo en el límite de longitud", () => {
    const result = rejectVendorOrderSchema.safeParse({ reason: "a".repeat(500) });
    expect(result.success).toBe(true);
  });

  it("rechaza comentarios que exceden la longitud máxima", () => {
    const result = rejectVendorOrderSchema.safeParse({
      reason: "Motivo válido",
      comments: "a".repeat(1001),
    });
    expect(result.success).toBe(false);
  });
});
