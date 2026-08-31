import ExcelJS from "exceljs";
import type { SheetMatrix } from "./cosmo-excel-parser";

/** Único punto de contacto con ExcelJS: convierte la primera hoja del
 * workbook a una matriz plana de strings, para que toda la lógica de
 * parseo (cosmo-excel-parser.ts) sea pura y no dependa de la librería de
 * Excel. No modifica el archivo original — solo lo lee. */
function cellToText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return String(value);

  if (value instanceof Date) {
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    const year = String(value.getUTCFullYear());
    return `${month}/${day}/${year}`;
  }

  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text ?? "").join("");
    }
    if ("result" in value) {
      return cellToText(value.result as ExcelJS.CellValue);
    }
    if ("text" in value && typeof value.text === "string") {
      return value.text;
    }
  }

  return String(value);
}

export async function readWorkbookAsMatrix(buffer: Buffer): Promise<SheetMatrix> {
  const workbook = new ExcelJS.Workbook();
  // exceljs trae su propia definición de `Buffer` en sus .d.ts, desalineada
  // con la versión más reciente de @types/node (le faltan miembros como
  // `resizable`/`detached`) — el cast evita ese roce puramente de tipos; en
  // runtime sigue siendo el mismo Buffer de Node.
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const matrix: SheetMatrix = [];
  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cells[colNumber - 1] = cellToText(cell.value);
    });
    matrix[rowNumber - 1] = cells;
  });

  return matrix;
}
