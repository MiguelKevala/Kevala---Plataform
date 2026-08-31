import { describe, expect, it } from "vitest";
import { findPeriodForDate, isDateWithinPeriod } from "@/modules/marketing/domain/cosmo-period-lookup";

const PERIOD = {
  startDate: new Date("2025-08-05T00:00:00.000Z"),
  endDate: new Date("2025-08-12T00:00:00.000Z"),
};

describe("isDateWithinPeriod", () => {
  it("acepta una fecha dentro del rango (límites inclusivos)", () => {
    expect(isDateWithinPeriod(new Date("2025-08-08T00:00:00.000Z"), PERIOD)).toBe(true);
    expect(isDateWithinPeriod(PERIOD.startDate, PERIOD)).toBe(true);
    expect(isDateWithinPeriod(PERIOD.endDate, PERIOD)).toBe(true);
  });

  it("rechaza una fecha antes de startDate o después de endDate", () => {
    expect(isDateWithinPeriod(new Date("2025-08-04T00:00:00.000Z"), PERIOD)).toBe(false);
    expect(isDateWithinPeriod(new Date("2025-08-13T00:00:00.000Z"), PERIOD)).toBe(false);
  });
});

describe("findPeriodForDate", () => {
  const periods = [
    { id: "p1", startDate: new Date("2025-08-05T00:00:00.000Z"), endDate: new Date("2025-08-12T00:00:00.000Z") },
    { id: "p2", startDate: new Date("2025-08-12T00:00:00.000Z"), endDate: new Date("2025-08-19T00:00:00.000Z") },
  ];

  it("encuentra el periodo correcto para una fecha dada", () => {
    const found = findPeriodForDate(periods, new Date("2025-08-15T00:00:00.000Z"));
    expect(found?.id).toBe("p2");
  });

  it("devuelve null si ningún periodo contiene la fecha", () => {
    const found = findPeriodForDate(periods, new Date("2025-09-01T00:00:00.000Z"));
    expect(found).toBeNull();
  });
});
