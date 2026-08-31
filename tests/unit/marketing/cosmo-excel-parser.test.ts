import { describe, expect, it } from "vitest";
import {
  detectProductBlocks,
  parseChangeCell,
  parseCosmoWorkbook,
  parsePeriodRange,
  parseProductBlock,
  parseUnitsCell,
  type SheetMatrix,
} from "@/modules/marketing/importer/cosmo-excel-parser";

describe("parsePeriodRange", () => {
  it("parsea un rango con año de 2 dígitos", () => {
    const result = parsePeriodRange("08/05/25 - 08/12/25");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.startDate.toISOString()).toBe("2025-08-05T00:00:00.000Z");
      expect(result.value.endDate.toISOString()).toBe("2025-08-12T00:00:00.000Z");
    }
  });

  it("parsea un rango con año de 4 dígitos", () => {
    const result = parsePeriodRange("08/05/2025 - 08/12/2025");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.startDate.toISOString()).toBe("2025-08-05T00:00:00.000Z");
    }
  });

  it("no crea Week Number ni ningún concepto de semana: solo startDate/endDate", () => {
    const result = parsePeriodRange("08/05/25 - 08/12/25");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.value).sort()).toEqual(["endDate", "startDate"]);
    }
  });

  it("reporta como error un formato irreconocible, sin inventar una fecha", () => {
    const result = parsePeriodRange("not a period");
    expect(result.ok).toBe(false);
  });

  it("reporta como error una fecha imposible (p.ej. 02/30)", () => {
    const result = parsePeriodRange("02/30/25 - 03/05/25");
    expect(result.ok).toBe(false);
  });

  it("reporta como error cuando Start Date es posterior a End Date", () => {
    const result = parsePeriodRange("08/12/25 - 08/05/25");
    expect(result.ok).toBe(false);
  });

  it("reporta como error una celda vacía", () => {
    const result = parsePeriodRange("");
    expect(result.ok).toBe(false);
  });
});

describe("parseUnitsCell", () => {
  it("acepta un entero válido", () => {
    const result = parseUnitsCell("125");
    expect(result).toEqual({ ok: true, value: 125 });
  });

  it("acepta 0", () => {
    expect(parseUnitsCell("0")).toEqual({ ok: true, value: 0 });
  });

  it("rechaza texto inválido", () => {
    expect(parseUnitsCell("abc").ok).toBe(false);
  });

  it("rechaza un valor vacío", () => {
    expect(parseUnitsCell("").ok).toBe(false);
  });

  it("rechaza un decimal (no trunca silenciosamente)", () => {
    expect(parseUnitsCell("12.5").ok).toBe(false);
  });

  it("rechaza un negativo", () => {
    expect(parseUnitsCell("-5").ok).toBe(false);
  });
});

const PERIOD_BOUNDS = {
  startDate: new Date("2025-08-19T00:00:00.000Z"),
  endDate: new Date("2025-08-26T00:00:00.000Z"),
};

describe("parseChangeCell", () => {
  it("convierte múltiples líneas en registros independientes, sin combinarlos, incluyendo el/los mercado(s)", () => {
    const result = parseChangeCell(
      "08/19/25 - USA - Title and bullets changed\n08/20/25 - USA, Mexico - A+ modified",
      PERIOD_BOUNDS,
    );
    expect(result.changes).toHaveLength(2);
    expect(result.changes[0]).toEqual({
      changeDate: new Date("2025-08-19T00:00:00.000Z"),
      description: "Title and bullets changed",
      country: ["USA"],
    });
    expect(result.changes[1]).toEqual({
      changeDate: new Date("2025-08-20T00:00:00.000Z"),
      description: "A+ modified",
      country: ["USA", "Mexico"],
    });
  });

  it("soporta múltiples changes en la misma fecha, cada uno con su propia combinación de mercados", () => {
    const result = parseChangeCell(
      "08/19/25 - USA - title changed\n08/19/25 - USA, Mexico - bullets changed\n08/19/25 - Canada - listing images changed",
      PERIOD_BOUNDS,
    );
    expect(result.changes).toHaveLength(3);
    expect(result.changes.every((change) => change.changeDate.getTime() === new Date("2025-08-19T00:00:00.000Z").getTime())).toBe(true);
    expect(result.changes.map((change) => change.description)).toEqual([
      "title changed",
      "bullets changed",
      "listing images changed",
    ]);
    expect(result.changes.map((change) => change.country)).toEqual([["USA"], ["USA", "Mexico"], ["Canada"]]);
  });

  it("elimina líneas vacías", () => {
    const result = parseChangeCell("\n08/19/25 - USA - title, bullets\n\n", PERIOD_BOUNDS);
    expect(result.changes).toHaveLength(1);
    expect(result.warnings).toHaveLength(0);
  });

  it("resuelve el año faltante usando el año del periodo cuando es inequívoco", () => {
    const result = parseChangeCell("08/20 - USA - A+ modified", PERIOD_BOUNDS);
    expect(result.warnings).toHaveLength(0);
    expect(result.changes).toEqual([
      { changeDate: new Date("2025-08-20T00:00:00.000Z"), description: "A+ modified", country: ["USA"] },
    ]);
  });

  it("resuelve el año faltante eligiendo el candidato que cae dentro del periodo cuando el periodo cruza fin de año", () => {
    const crossYearPeriod = {
      startDate: new Date("2025-12-29T00:00:00.000Z"),
      endDate: new Date("2026-01-04T00:00:00.000Z"),
    };
    const result = parseChangeCell("01/02 - USA - New Year listing update", crossYearPeriod);
    expect(result.warnings).toHaveLength(0);
    expect(result.changes).toEqual([
      {
        changeDate: new Date("2026-01-02T00:00:00.000Z"),
        description: "New Year listing update",
        country: ["USA"],
      },
    ]);
  });

  it("marca como warning una fecha sin año que no cae en ningún año candidato del periodo", () => {
    const result = parseChangeCell("03/15 - USA - out of range", PERIOD_BOUNDS);
    expect(result.changes).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].line).toBe("03/15 - USA - out of range");
  });

  it("reporta como warning una línea sin formato reconocible, sin afectar las demás líneas", () => {
    const result = parseChangeCell("this is not a valid line\n08/19/25 - USA - title, bullets", PERIOD_BOUNDS);
    expect(result.changes).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
  });

  it("reporta como warning una fecha inválida con año explícito (no inventa la fecha)", () => {
    const result = parseChangeCell("02/30/25 - USA - impossible date", PERIOD_BOUNDS);
    expect(result.changes).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
  });

  it("reporta como warning un mercado no reconocido, sin asociarlo silenciosamente a otro", () => {
    const result = parseChangeCell("08/19/25 - Brazil - title, bullets", PERIOD_BOUNDS);
    expect(result.changes).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].reason).toContain("Brazil");
  });

  it("reporta como warning una línea con el formato antiguo de 2 segmentos (sin mercado)", () => {
    // El formato real siempre incluye el segmento de mercado(s); una línea
    // "fecha - descripción" sin ese segmento ya no se interpreta como
    // válida (§ no inventar el mercado).
    const result = parseChangeCell("08/19/25 - title, bullets", PERIOD_BOUNDS);
    expect(result.changes).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
  });

  it("acepta '—' (em dash) como separador, igual que '-'", () => {
    const result = parseChangeCell("08/19/25 — USA — Title and bullets changed", PERIOD_BOUNDS);
    expect(result.changes).toEqual([
      {
        changeDate: new Date("2025-08-19T00:00:00.000Z"),
        description: "Title and bullets changed",
        country: ["USA"],
      },
    ]);
  });
});

describe("detectProductBlocks", () => {
  it("detecta un único bloque de producto", () => {
    const matrix: SheetMatrix = [
      ["Product name", "Product A"],
      ["ASIN", "B0AAA00001"],
    ];
    const blocks = detectProductBlocks(matrix);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({ labelRow: 0, labelCol: 0, endRowExclusive: matrix.length });
  });

  it("detecta múltiples bloques sin depender de números de fila fijos", () => {
    const matrix: SheetMatrix = [
      ["Product name", "Product A"],
      ["ASIN", "B0AAA00001"],
      [],
      [],
      ["Product name", "Product B"],
      ["ASIN", "B0BBB00002"],
    ];
    const blocks = detectProductBlocks(matrix);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({ labelRow: 0, labelCol: 0, endRowExclusive: 4 });
    expect(blocks[1]).toEqual({ labelRow: 4, labelCol: 0, endRowExclusive: matrix.length });
  });

  it("funciona igual para 1, 10 o 100+ bloques (no hardcodea una cantidad)", () => {
    const matrix: SheetMatrix = [];
    const productCount = 120;
    for (let i = 0; i < productCount; i++) {
      matrix.push(["Product name", `Product ${i}`]);
      matrix.push(["ASIN", `B0PROD${String(i).padStart(5, "0")}`]);
      matrix.push([]);
    }
    const blocks = detectProductBlocks(matrix);
    expect(blocks).toHaveLength(productCount);
  });
});

/** Reproduce el layout REAL documentado en la spec (§2): las etiquetas de
 * producto (Product name/ASIN/LINK/Country) viven en la columna A con su
 * valor en B, mientras que la grilla de periodos (Period/Units sold/
 * Change/Unit available) vive en la columna B con sus valores empezando en
 * C — es decir, en una columna DISTINTA a la del bloque de producto. */
function buildBlockRows(overrides: {
  productName?: string;
  asin?: string;
  link?: string;
  country?: string;
  periodRow?: string[];
  unitsSoldRow?: string[];
  changeRow?: string[];
  unitsAvailableRow?: string[];
}): SheetMatrix {
  return [
    ["Product name", overrides.productName ?? "Product A"],
    ["ASIN", overrides.asin ?? "B0AAA00001"],
    ["LINK", overrides.link ?? "https://amazon.com/dp/B0AAA00001"],
    ["Country", overrides.country ?? "USA"],
    [],
    ["", "Period", ...(overrides.periodRow ?? ["08/05/25 - 08/12/25", "08/12/25 - 08/19/25"])],
    ["", "Units sold", ...(overrides.unitsSoldRow ?? ["125", "140"])],
    ["", "Change", ...(overrides.changeRow ?? ["08/06/25 - USA - title, bullets", ""])],
    ["", "Unit available", ...(overrides.unitsAvailableRow ?? ["340", "300"])],
  ];
}

describe("parseProductBlock / parseCosmoWorkbook", () => {
  it("parsea un bloque completo con múltiples periodos y produce CosmoPeriod + Changes correctos", () => {
    const matrix = buildBlockRows({});
    const [block] = parseCosmoWorkbook(matrix);

    expect(block.productName).toBe("Product A");
    expect(block.asin).toBe("B0AAA00001");
    expect(block.link).toBe("https://amazon.com/dp/B0AAA00001");
    expect(block.country).toBe("USA");
    expect(block.blockErrors).toEqual([]);
    expect(block.periods).toHaveLength(2);

    const [firstPeriod, secondPeriod] = block.periods;
    expect(firstPeriod.period).toEqual({
      ok: true,
      value: { startDate: new Date("2025-08-05T00:00:00.000Z"), endDate: new Date("2025-08-12T00:00:00.000Z") },
    });
    expect(firstPeriod.unitsSold).toEqual({ ok: true, value: 125 });
    expect(firstPeriod.unitsAvailable).toEqual({ ok: true, value: 340 });
    expect(firstPeriod.changes).toEqual([
      { changeDate: new Date("2025-08-06T00:00:00.000Z"), description: "title, bullets", country: ["USA"] },
    ]);

    expect(secondPeriod.unitsSold).toEqual({ ok: true, value: 140 });
    expect(secondPeriod.changes).toEqual([]);
  });

  it("importa correctamente múltiples productos en el mismo archivo", () => {
    const matrixA = buildBlockRows({ productName: "Product A", asin: "B0AAA00001" });
    const matrixB = buildBlockRows({ productName: "Product B", asin: "B0BBB00002" });
    const matrix = [...matrixA, [], [], ...matrixB];

    const blocks = parseCosmoWorkbook(matrix);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].asin).toBe("B0AAA00001");
    expect(blocks[1].asin).toBe("B0BBB00002");
    expect(blocks[1].periods).toHaveLength(2);
  });

  it("reporta un error de bloque cuando falta la fila Period, sin lanzar una excepción", () => {
    const matrix: SheetMatrix = [
      ["Product name", "Product A"],
      ["ASIN", "B0AAA00001"],
      ["LINK", "https://amazon.com/dp/B0AAA00001"],
      ["Country", "USA"],
    ];
    const [block] = parseCosmoWorkbook(matrix);
    expect(block.blockErrors.length).toBeGreaterThan(0);
    expect(block.periods).toEqual([]);
  });

  it("reporta como periodo inválido una columna con formato de Period irreconocible, sin detener el resto del bloque", () => {
    const matrix = buildBlockRows({ periodRow: ["not a period", "08/12/25 - 08/19/25"], unitsSoldRow: ["125", "140"], unitsAvailableRow: ["340", "300"], changeRow: ["", ""] });
    const [block] = parseCosmoWorkbook(matrix);
    expect(block.periods).toHaveLength(2);
    expect(block.periods[0].period.ok).toBe(false);
    expect(block.periods[1].period.ok).toBe(true);
  });

  it("usa la etiqueta 'Unit available' (singular) igual que 'Units available'", () => {
    const rows = buildBlockRows({});
    // La fila de "Unit available" ya usa el singular tal como en el Excel real (§2).
    expect(rows[8][1]).toBe("Unit available");
    const [block] = parseCosmoWorkbook(rows);
    expect(block.periods[0].unitsAvailable).toEqual({ ok: true, value: 340 });
  });

  it("parsea un bloque de producto individual (parseProductBlock) igual que vía el workbook completo", () => {
    const matrix = buildBlockRows({});
    const blocks = detectProductBlocks(matrix);
    const block = parseProductBlock(matrix, blocks[0]);
    expect(block.asin).toBe("B0AAA00001");
    expect(block.periods).toHaveLength(2);
  });
});
