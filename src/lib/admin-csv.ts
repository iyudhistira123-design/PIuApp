// Export only rows already authorized and returned by the API, never an implicit full dump.
export function adminCSV(rows: Record<string, unknown>[]): string {
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const cell = (v: unknown) => {
    let text =
      v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    // Defend against spreadsheet formulas, including leading whitespace/control characters.
    if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return (
    "\ufeff" +
    [
      columns.map(cell).join(","),
      ...rows.map((row) => columns.map((c) => cell(row[c])).join(",")),
    ].join("\r\n")
  );
}
