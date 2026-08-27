import { describe, expect, it } from "vitest";
import { buildVendorOrderNotificationContent } from "@/modules/notifications/content";

describe("buildVendorOrderNotificationContent", () => {
  it("confirmed: type VENDOR_ORDER_CONFIRMED y menciona el número de orden", () => {
    const content = buildVendorOrderNotificationContent({ event: "confirmed", orderNumber: "PO-001" });
    expect(content.type).toBe("VENDOR_ORDER_CONFIRMED");
    expect(content.title).toBeTruthy();
    expect(content.message).toContain("PO-001");
  });

  it("rejected: type VENDOR_ORDER_REJECTED y menciona el número de orden", () => {
    const content = buildVendorOrderNotificationContent({ event: "rejected", orderNumber: "PO-002" });
    expect(content.type).toBe("VENDOR_ORDER_REJECTED");
    expect(content.message).toContain("PO-002");
  });

  it("delivered: type VENDOR_ORDER_DELIVERED y menciona el número de orden", () => {
    const content = buildVendorOrderNotificationContent({ event: "delivered", orderNumber: "PO-003" });
    expect(content.type).toBe("VENDOR_ORDER_DELIVERED");
    expect(content.message).toContain("PO-003");
  });

  it("cada evento produce un título distinto", () => {
    const titles = new Set(
      (["confirmed", "rejected", "delivered"] as const).map(
        (event) => buildVendorOrderNotificationContent({ event, orderNumber: "PO-004" }).title,
      ),
    );
    expect(titles.size).toBe(3);
  });
});
