import { isDateWithinPeriod } from "../domain/cosmo-period-lookup";
import { COUNTRY_VALUES, type CountryValue } from "@/modules/products/validation";

/** Matriz plana de celdas [fila][columna], ambos 0-based — desacoplada de
 * ExcelJS a propósito para que toda esta lógica sea pura y testable sin
 * tener que construir un workbook real (ver cosmo-excel-reader.ts para el
 * adapter que sí depende de ExcelJS). */
export type SheetMatrix = string[][];

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase();
}

function cellAt(matrix: SheetMatrix, row: number | null, col: number): string {
  if (row === null) return "";
  return (matrix[row]?.[col] ?? "").toString().trim();
}

const PRODUCT_NAME_LABEL = "product name";
const ASIN_LABEL = "asin";
const LINK_LABEL = "link";
const COUNTRY_LABEL = "country";
const PERIOD_LABEL = "period";
const UNITS_SOLD_LABELS = ["units sold", "unit sold"];
const CHANGE_LABEL = "change";
const UNITS_AVAILABLE_LABELS = ["units available", "unit available"];

export interface ProductBlockRange {
  labelRow: number;
  labelCol: number;
  endRowExclusive: number;
}

/** Detecta cada bloque de producto por la etiqueta "Product name" (en
 * cualquier fila/columna, nunca asumiendo una fila fija) y lo delimita
 * hasta el siguiente bloque encontrado, o el final de la hoja. */
export function detectProductBlocks(matrix: SheetMatrix): ProductBlockRange[] {
  const blocks: ProductBlockRange[] = [];

  for (let row = 0; row < matrix.length; row++) {
    const cols = matrix[row] ?? [];
    for (let col = 0; col < cols.length; col++) {
      if (normalizeLabel(cols[col] ?? "") === PRODUCT_NAME_LABEL) {
        blocks.push({ labelRow: row, labelCol: col, endRowExclusive: matrix.length });
      }
    }
  }

  for (let i = 0; i < blocks.length - 1; i++) {
    blocks[i].endRowExclusive = blocks[i + 1].labelRow;
  }

  return blocks;
}

function findLabelRow(
  matrix: SheetMatrix,
  fromRow: number,
  toRowExclusive: number,
  col: number,
  labels: string[],
): number | null {
  for (let row = fromRow; row < toRowExclusive && row < matrix.length; row++) {
    if (labels.includes(normalizeLabel(matrix[row]?.[col] ?? ""))) return row;
  }
  return null;
}

interface LabelCell {
  row: number;
  col: number;
}

/** A diferencia de findLabelRow, no asume ninguna columna: recorre TODAS
 * las columnas de cada fila. Necesario porque, en el Excel real, "Period"
 * vive en una columna distinta a "Product name"/"ASIN"/"LINK"/"Country"
 * (una columna a la derecha en el ejemplo documentado — B7 vs A2) — el
 * importador nunca debe asumir que ambos grupos de etiquetas comparten
 * columna, solo que cada uno es internamente consistente. */
function findLabelCell(
  matrix: SheetMatrix,
  fromRow: number,
  toRowExclusive: number,
  labels: string[],
): LabelCell | null {
  for (let row = fromRow; row < toRowExclusive && row < matrix.length; row++) {
    const cols = matrix[row] ?? [];
    for (let col = 0; col < cols.length; col++) {
      if (labels.includes(normalizeLabel(cols[col] ?? ""))) return { row, col };
    }
  }
  return null;
}

const PERIOD_RANGE_PATTERN =
  /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/;
// Formato real de una línea de Change: "MM/DD[/YY[YY]] - market(s) -
// description", p.ej. "08/19/25 - USA - Title and bullets changed" o
// "08/15/25 - USA, Mexico - A+ modified". El segmento de mercados es
// no-goloso y excluye guiones para detenerse en el PRÓXIMO guion (el que
// separa mercados de descripción); la descripción sí puede contener
// guiones porque es el último grupo y consume el resto de la línea.
// Acepta tanto "-" como "—" (em dash) como separador.
const CHANGE_LINE_PATTERN =
  /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\s*[-—]\s*([^-—]+?)\s*[-—]\s*(.+)$/;

function expandYear(rawYear: string): number {
  return rawYear.length === 4 ? Number(rawYear) : 2000 + Number(rawYear);
}

/** Construye una fecha UTC a medianoche y rechaza fechas que no existen
 * (p.ej. 02/30) en vez de dejar que Date "las corrija" silenciosamente
 * (rollover a marzo). */
function buildUtcDate(month: string, day: string, year: number): Date | null {
  const monthNum = Number(month);
  const dayNum = Number(day);
  if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) return null;

  const date = new Date(Date.UTC(year, monthNum - 1, dayNum));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== monthNum - 1 || date.getUTCDate() !== dayNum) {
    return null;
  }
  return date;
}

export type PeriodParseResult =
  | { ok: true; value: { startDate: Date; endDate: Date } }
  | { ok: false; error: string };

/** "08/05/25 - 08/12/25" -> { startDate: 2025-08-05, endDate: 2025-08-12 }.
 * Nunca inventa una fecha: si no puede interpretarse, se reporta como
 * error (§21). */
export function parsePeriodRange(raw: string): PeriodParseResult {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: false, error: "Period is empty." };

  const match = PERIOD_RANGE_PATTERN.exec(trimmed);
  if (!match) return { ok: false, error: `Invalid period format: "${raw}"` };

  const [, startMonth, startDay, startYear, endMonth, endDay, endYear] = match;
  const startDate = buildUtcDate(startMonth, startDay, expandYear(startYear));
  const endDate = buildUtcDate(endMonth, endDay, expandYear(endYear));

  if (!startDate || !endDate) return { ok: false, error: `Invalid date in period: "${raw}"` };
  if (startDate.getTime() > endDate.getTime()) {
    return { ok: false, error: `Start Date is after End Date: "${raw}"` };
  }

  return { ok: true, value: { startDate, endDate } };
}

export type NumberParseResult = { ok: true; value: number } | { ok: false; error: string };

/** Units Sold / Units Available: entero no negativo. No acepta texto
 * inválido ni decimales silenciosamente truncados (§28). */
export function parseUnitsCell(raw: string): NumberParseResult {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: false, error: "Missing value." };
  if (!/^\d+$/.test(trimmed)) return { ok: false, error: `Invalid number: "${raw}"` };
  return { ok: true, value: Number(trimmed) };
}

export interface ParsedChangeLine {
  changeDate: Date;
  description: string;
  country: CountryValue[];
}

const COUNTRY_BY_NORMALIZED_LABEL = new Map<string, CountryValue>(
  COUNTRY_VALUES.map((value) => [normalizeLabel(value), value]),
);

/** "USA, Mexico" -> ["USA", "Mexico"]. Cada token debe ser exactamente uno
 * de los mercados del enum (sin importar mayúsculas/minúsculas); si algún
 * token no se reconoce, TODA la línea se reporta como inválida — no se
 * asocia silenciosamente a un subconjunto parcial (§4/§26 aplicado aquí
 * también: no inventar, no asociar de forma silenciosa). Que además
 * pertenezcan a los mercados configurados del producto se valida más
 * adelante, en el servicio de importación, donde sí hay contexto del
 * producto. */
function parseMarketsSegment(raw: string): { ok: true; value: CountryValue[] } | { ok: false; error: string } {
  const tokens = raw
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  if (tokens.length === 0) return { ok: false, error: "Missing market(s)." };

  const resolved: CountryValue[] = [];
  for (const token of tokens) {
    const match = COUNTRY_BY_NORMALIZED_LABEL.get(normalizeLabel(token));
    if (!match) return { ok: false, error: `Unrecognized market: "${token}"` };
    resolved.push(match);
  }

  return { ok: true, value: resolved };
}

export interface ChangeLineWarning {
  line: string;
  reason: string;
}

export interface ParseChangeCellResult {
  changes: ParsedChangeLine[];
  warnings: ChangeLineWarning[];
}

/** Una celda de Change puede tener varias líneas ("08/19/25 - title,
 * bullets\n08/15 - A+ modified"): cada línea se separa, se limpia, y se
 * convierte en un CosmoChange independiente (§23). El año puede faltar
 * (§24): se resuelve probando el año de Start Date y de End Date del
 * periodo dueño de la celda, y aceptando el resultado solo si cae dentro
 * del periodo de forma inequívoca (exactamente un candidato válido); en
 * cualquier otro caso (0 candidatos o ambigüedad real) se reporta como
 * warning y esa línea no se importa, sin afectar las demás líneas. */
export function parseChangeCell(
  raw: string,
  periodBounds: { startDate: Date; endDate: Date },
): ParseChangeCellResult {
  const changes: ParsedChangeLine[] = [];
  const warnings: ChangeLineWarning[] = [];

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    const match = CHANGE_LINE_PATTERN.exec(line);
    if (!match) {
      warnings.push({ line, reason: "Could not parse a date and description from this line." });
      continue;
    }

    const [, monthStr, dayStr, yearStr, rawMarkets, rawDescription] = match;
    const description = rawDescription.trim();
    if (description === "") {
      warnings.push({ line, reason: "Missing description." });
      continue;
    }

    const marketsResult = parseMarketsSegment(rawMarkets);
    if (!marketsResult.ok) {
      warnings.push({ line, reason: marketsResult.error });
      continue;
    }

    let resolvedDate: Date | null;
    if (yearStr) {
      resolvedDate = buildUtcDate(monthStr, dayStr, expandYear(yearStr));
      if (!resolvedDate) {
        warnings.push({ line, reason: "Invalid date." });
        continue;
      }
    } else {
      const candidateYears = Array.from(
        new Set([periodBounds.startDate.getUTCFullYear(), periodBounds.endDate.getUTCFullYear()]),
      );
      const validCandidates = candidateYears
        .map((year) => buildUtcDate(monthStr, dayStr, year))
        .filter((date): date is Date => date !== null)
        .filter((date) => isDateWithinPeriod(date, periodBounds));

      if (validCandidates.length !== 1) {
        warnings.push({
          line,
          reason:
            validCandidates.length === 0
              ? "Year is missing and no candidate year falls within this period."
              : "Year is missing and more than one candidate year is valid for this period.",
        });
        continue;
      }
      resolvedDate = validCandidates[0];
    }

    changes.push({ changeDate: resolvedDate, description, country: marketsResult.value });
  }

  return { changes, warnings };
}

export interface ParsedPeriodEntry {
  columnIndex: number;
  raw: { period: string; unitsSold: string; unitsAvailable: string; change: string };
  period: PeriodParseResult;
  unitsSold: NumberParseResult;
  unitsAvailable: NumberParseResult;
  changes: ParsedChangeLine[];
  changeWarnings: ChangeLineWarning[];
}

export interface ParsedProductBlock {
  rowIndex: number;
  productName: string;
  asin: string;
  link: string;
  country: string;
  periods: ParsedPeriodEntry[];
  blockErrors: string[];
}

export function parseProductBlock(matrix: SheetMatrix, block: ProductBlockRange): ParsedProductBlock {
  const { labelRow, labelCol, endRowExclusive } = block;
  const valueCol = labelCol + 1;
  const blockErrors: string[] = [];

  const productName = cellAt(matrix, labelRow, valueCol);

  const asinRow = findLabelRow(matrix, labelRow + 1, endRowExclusive, labelCol, [ASIN_LABEL]);
  const asin = cellAt(matrix, asinRow, valueCol);
  if (asinRow === null) blockErrors.push("ASIN label not found for this product block.");

  const linkRow = findLabelRow(matrix, labelRow + 1, endRowExclusive, labelCol, [LINK_LABEL]);
  const link = cellAt(matrix, linkRow, valueCol);

  const countryRow = findLabelRow(matrix, labelRow + 1, endRowExclusive, labelCol, [COUNTRY_LABEL]);
  const country = cellAt(matrix, countryRow, valueCol);

  // "Period" no necesariamente comparte columna con "Product name" (en el
  // Excel real está en la columna siguiente — ver comentario de
  // findLabelCell) — se busca de forma independiente, en cualquier columna.
  const periodLabel = findLabelCell(matrix, labelRow + 1, endRowExclusive, [PERIOD_LABEL]);
  if (!periodLabel) {
    blockErrors.push("Period row not found for this product block.");
    return { rowIndex: labelRow, productName, asin, link, country, periods: [], blockErrors };
  }
  const { row: periodRow, col: periodLabelCol } = periodLabel;
  const periodValueStartCol = periodLabelCol + 1;

  // Units sold / Change / Unit available sí están alineadas verticalmente
  // bajo "Period", en su misma columna (B8, B9, B10 en el ejemplo).
  const unitsSoldRow = findLabelRow(matrix, periodRow + 1, endRowExclusive, periodLabelCol, UNITS_SOLD_LABELS);
  const changeRow = findLabelRow(matrix, periodRow + 1, endRowExclusive, periodLabelCol, [CHANGE_LABEL]);
  const unitsAvailableRow = findLabelRow(
    matrix,
    periodRow + 1,
    endRowExclusive,
    periodLabelCol,
    UNITS_AVAILABLE_LABELS,
  );

  if (unitsSoldRow === null) blockErrors.push('"Units sold" row not found for this product block.');
  if (unitsAvailableRow === null) {
    blockErrors.push('"Unit available" row not found for this product block.');
  }

  if (unitsSoldRow === null || unitsAvailableRow === null) {
    return { rowIndex: labelRow, productName, asin, link, country, periods: [], blockErrors };
  }

  const periodHeaderCells = matrix[periodRow] ?? [];
  const periodColumns: number[] = [];
  for (let col = periodValueStartCol; col < periodHeaderCells.length; col++) {
    if ((periodHeaderCells[col] ?? "").toString().trim() !== "") {
      periodColumns.push(col);
    }
  }

  const periods: ParsedPeriodEntry[] = periodColumns.map((col) => {
    const periodRaw = cellAt(matrix, periodRow, col);
    const unitsSoldRaw = cellAt(matrix, unitsSoldRow, col);
    const unitsAvailableRaw = cellAt(matrix, unitsAvailableRow, col);
    const changeRaw = cellAt(matrix, changeRow, col);

    const period = parsePeriodRange(periodRaw);
    const unitsSold = parseUnitsCell(unitsSoldRaw);
    const unitsAvailable = parseUnitsCell(unitsAvailableRaw);

    let changes: ParsedChangeLine[] = [];
    let changeWarnings: ChangeLineWarning[] = [];
    if (period.ok && changeRaw.trim() !== "") {
      const parsed = parseChangeCell(changeRaw, period.value);
      changes = parsed.changes;
      changeWarnings = parsed.warnings;
    }

    return {
      columnIndex: col,
      raw: { period: periodRaw, unitsSold: unitsSoldRaw, unitsAvailable: unitsAvailableRaw, change: changeRaw },
      period,
      unitsSold,
      unitsAvailable,
      changes,
      changeWarnings,
    };
  });

  return { rowIndex: labelRow, productName, asin, link, country, periods, blockErrors };
}

export function parseCosmoWorkbook(matrix: SheetMatrix): ParsedProductBlock[] {
  return detectProductBlocks(matrix).map((block) => parseProductBlock(matrix, block));
}
