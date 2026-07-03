const LEGACY_HEADER = "Collection,Mode,Variable,Type,Value,Scopes,Description";

// Columns kept from the current 9-column row (Collection,Mode,Variable,Type,
// DTCG Type,Value,Scopes,Inherited,Description): drops "DTCG Type" (4) and
// "Inherited" (7), which didn't exist pre-`12930fe`.
const KEEP_INDICES = [0, 1, 2, 3, 5, 6, 8];

/**
 * Splits a CSV row into raw field substrings, respecting RFC4180-style
 * quoting (quoted fields may contain commas and escaped `""` quotes). Fields
 * are returned verbatim, including surrounding quotes, so they can be
 * rejoined without re-escaping.
 */
function splitCsvRow(row: string): string[] {
  const fields: string[] = [];
  let i = 0;
  const len = row.length;

  while (i <= len) {
    if (row[i] === '"') {
      let j = i + 1;
      let field = '"';
      while (j < len) {
        if (row[j] === '"') {
          if (row[j + 1] === '"') {
            field += '""';
            j += 2;
            continue;
          }
          field += '"';
          j++;
          break;
        }
        field += row[j];
        j++;
      }
      fields.push(field);
      i = j;
      if (row[i] === ',') i++;
      else break;
    } else {
      let j = i;
      while (j < len && row[j] !== ',') j++;
      fields.push(row.slice(i, j));
      i = j;
      if (row[i] === ',') i++;
      else break;
    }
  }

  return fields;
}

/**
 * Converts the current exporter's CSV output into the pre-`12930fe` (v2.x)
 * shape: drops the "DTCG Type" and "Inherited" columns, leaving
 * `Collection,Mode,Variable,Type,Value,Scopes,Description`. Rows produced
 * from Enterprise extended collections (which v2.x never had) are kept, just
 * without the "Inherited" column — their inherited values already read as
 * `=Collection/mode/Variable` references, same as any other alias.
 */
export function toLegacyCSV(csv: string): string {
  const lines = csv.split("\n").filter((line) => line.length > 0);
  const rows = lines.slice(1);

  const legacyRows = rows.map((line) => {
    const fields = splitCsvRow(line);
    return KEEP_INDICES.map((index) => fields[index] ?? "").join(",");
  });

  return [LEGACY_HEADER, ...legacyRows].join("\n");
}
