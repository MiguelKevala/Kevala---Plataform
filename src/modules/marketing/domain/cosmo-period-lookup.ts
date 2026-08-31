/** Único lugar donde vive la regla "¿a qué periodo pertenece esta fecha?" —
 * usada tanto por el servicio de Changes manuales como por el importador,
 * para no duplicar la lógica. changeDate >= startDate AND changeDate <=
 * endDate (ambos límites inclusivos). */
export interface PeriodDateRange {
  startDate: Date;
  endDate: Date;
}

export function isDateWithinPeriod(date: Date, period: PeriodDateRange): boolean {
  return date.getTime() >= period.startDate.getTime() && date.getTime() <= period.endDate.getTime();
}

export function findPeriodForDate<T extends PeriodDateRange>(
  periods: readonly T[],
  date: Date,
): T | null {
  return periods.find((period) => isDateWithinPeriod(date, period)) ?? null;
}
