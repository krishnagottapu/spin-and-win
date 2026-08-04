/**
 * CSV Export Utility for participant data.
 *
 * IMPORTANT: The "phone" column contains PII (personally identifiable information).
 * Handle exported CSV files according to your organization's data retention policies.
 */

export interface CsvParticipantRow {
  name: string;
  /** PII — phone numbers are personally identifiable information */
  phone: string;
  prize_won: string;
  fulfilled: 'Yes' | 'No';
  queue_position: number;
  joined_at: string;
  spin_completed_at: string | null;
  fulfilled_at: string | null;
  fulfilled_by_staff_name: string | null;
}

const CSV_HEADERS: ReadonlyArray<keyof CsvParticipantRow> = [
  'name',
  'phone',
  'prize_won',
  'fulfilled',
  'queue_position',
  'joined_at',
  'spin_completed_at',
  'fulfilled_at',
  'fulfilled_by_staff_name',
];

/**
 * Escapes a CSV field value per RFC 4180:
 * - If the value contains a comma, double-quote, or newline, wrap in double-quotes
 * - Double-escape any internal double-quotes
 */
function escapeCsvField(value: string | number | null): string {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Converts an array of CsvParticipantRow objects into a valid CSV string
 * with a header row followed by data rows.
 */
export function toCsvString(rows: CsvParticipantRow[]): string {
  const headerLine = CSV_HEADERS.join(',');
  const dataLines = rows.map((row) =>
    CSV_HEADERS.map((col) => escapeCsvField(row[col])).join(',')
  );
  return [headerLine, ...dataLines].join('\n');
}
