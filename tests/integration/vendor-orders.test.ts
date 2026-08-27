import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  getOrderCountsByStatus,
  getRecentPendingOrders,
  getVendorOrderWithHistory,
  listVendorOrders,
} from "@/modules/vendor/repository/vendor-order.repository";

const PREFIX = "VTEST-";

async function cleanup() {
  await prisma.vendorOrder.deleteMany({ where: { orderNumber: { startsWith: PREFIX } } });
}

describe("VendorOrder repository", () => {
  let rejectedOrderId: string;
  let baselineCounts: Awaited<ReturnType<typeof getOrderCountsByStatus>>;

  beforeAll(async () => {
    await cleanup();

    // La tabla puede tener otras órdenes (ej. datos de demo dejados para pruebas
    // manuales), así que medimos el punto de partida en vez de asumir una tabla vacía.
    baselineCounts = await getOrderCountsByStatus();

    await prisma.vendorOrder.create({
      data: {
        orderNumber: `${PREFIX}P1`,
        status: "PENDING",
        orderDate: new Date("2026-01-05"),
        confirmationDeadline: new Date("2026-01-10"),
      },
    });
    await prisma.vendorOrder.create({
      data: { orderNumber: `${PREFIX}P2`, status: "PENDING", orderDate: new Date("2026-01-06") },
    });
    await prisma.vendorOrder.create({
      data: {
        orderNumber: `${PREFIX}C1`,
        status: "CONFIRMED",
        orderDate: new Date("2026-01-01"),
        confirmedAt: new Date("2026-01-02"),
        deliveryDeadline: new Date("2026-01-20"),
      },
    });
    const rejectedOrder = await prisma.vendorOrder.create({
      data: {
        orderNumber: `${PREFIX}R1`,
        status: "REJECTED",
        orderDate: new Date("2026-01-03"),
        rejectedAt: new Date("2026-01-04"),
      },
    });
    rejectedOrderId = rejectedOrder.id;
    await prisma.vendorOrder.create({
      data: {
        orderNumber: `${PREFIX}D1`,
        status: "DELIVERED",
        orderDate: new Date("2026-01-07"),
        confirmedAt: new Date("2026-01-08"),
        deliveredAt: new Date("2026-01-09"),
      },
    });

    await prisma.vendorOrderStatusHistory.createMany({
      data: [
        {
          vendorOrderId: rejectedOrderId,
          previousStatus: null,
          newStatus: "PENDING",
          createdAt: new Date("2026-01-03T09:00:00Z"),
        },
        {
          vendorOrderId: rejectedOrderId,
          previousStatus: "PENDING",
          newStatus: "REJECTED",
          reason: "Stock insuficiente",
          comments: "Cliente notificado",
          createdAt: new Date("2026-01-04T10:00:00Z"),
        },
      ],
    });
  });

  afterAll(cleanup);

  describe("getOrderCountsByStatus", () => {
    it("suma exactamente las órdenes de prueba creadas, por estado", async () => {
      const counts = await getOrderCountsByStatus();
      expect(counts.PENDING - baselineCounts.PENDING).toBe(2);
      expect(counts.CONFIRMED - baselineCounts.CONFIRMED).toBe(1);
      expect(counts.REJECTED - baselineCounts.REJECTED).toBe(1);
      expect(counts.DELIVERED - baselineCounts.DELIVERED).toBe(1);
    });
  });

  describe("getRecentPendingOrders", () => {
    it("devuelve solo PENDING, ordenadas por fecha de orden descendente", async () => {
      const orders = await getRecentPendingOrders(50);
      const testOrders = orders
        .filter((order) => order.orderNumber.startsWith(PREFIX))
        .map((order) => order.orderNumber);
      expect(testOrders).toEqual([`${PREFIX}P2`, `${PREFIX}P1`]);
    });

    it("respeta el límite", async () => {
      const orders = await getRecentPendingOrders(1);
      expect(orders).toHaveLength(1);
    });
  });

  describe("listVendorOrders", () => {
    it("filtra por búsqueda de PO", async () => {
      const { items, total } = await listVendorOrders({
        search: `${PREFIX}C1`,
        page: 1,
        pageSize: 20,
      });
      expect(total).toBe(1);
      expect(items[0].orderNumber).toBe(`${PREFIX}C1`);
    });

    it("filtra por estado", async () => {
      const { items, total } = await listVendorOrders({
        search: PREFIX,
        status: ["PENDING"],
        page: 1,
        pageSize: 20,
      });
      expect(total).toBe(2);
      expect(items.every((item) => item.status === "PENDING")).toBe(true);
    });

    it("filtra por varios estados a la vez", async () => {
      const { items, total } = await listVendorOrders({
        search: PREFIX,
        status: ["REJECTED", "DELIVERED"],
        page: 1,
        pageSize: 20,
      });
      expect(total).toBe(2);
      expect(items.every((item) => item.status === "REJECTED" || item.status === "DELIVERED")).toBe(true);
    });

    it("filtra por rango de fecha de orden", async () => {
      const { total } = await listVendorOrders({
        search: PREFIX,
        dateFrom: new Date("2026-01-05"),
        dateTo: new Date("2026-01-06"),
        page: 1,
        pageSize: 20,
      });
      expect(total).toBe(2);
    });

    it("pagina correctamente", async () => {
      const { items, total } = await listVendorOrders({ search: PREFIX, page: 1, pageSize: 2 });
      expect(total).toBe(5);
      expect(items).toHaveLength(2);
    });
  });

  describe("getVendorOrderWithHistory", () => {
    it("incluye el historial ordenado cronológicamente, con motivo y comentarios", async () => {
      const order = await getVendorOrderWithHistory(rejectedOrderId);
      expect(order?.statusHistory).toHaveLength(2);
      expect(order?.statusHistory[0].newStatus).toBe("PENDING");
      expect(order?.statusHistory[1].newStatus).toBe("REJECTED");
      expect(order?.statusHistory[1].reason).toBe("Stock insuficiente");
      expect(order?.statusHistory[1].comments).toBe("Cliente notificado");
    });

    it("devuelve null si la orden no existe", async () => {
      const order = await getVendorOrderWithHistory("does-not-exist");
      expect(order).toBeNull();
    });
  });
});
