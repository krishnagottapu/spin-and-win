import { describe, it, expect } from 'vitest';
import { toCsvString } from '@/lib/utils/csvExport';
import type { CsvParticipantRow } from '@/lib/utils/csvExport';

describe('toCsvString', () => {
  const baseRow: CsvParticipantRow = {
    name: 'Alice Johnson',
    phone: '+13035551234',
    prize_won: 'Free T-Shirt',
    fulfilled: 'Yes',
    queue_position: 1,
    joined_at: '2026-08-03T18:00:00Z',
    spin_completed_at: '2026-08-03T18:05:00Z',
    fulfilled_at: '2026-08-03T18:10:00Z',
    fulfilled_by_staff_name: 'Jane Staff',
  };

  it('formats rows into correct CSV string with header row', () => {
    const rows: CsvParticipantRow[] = [baseRow];
    const result = toCsvString(rows);
    const lines = result.split('\n');

    // Header row
    expect(lines[0]).toBe(
      'name,phone,prize_won,fulfilled,queue_position,joined_at,spin_completed_at,fulfilled_at,fulfilled_by_staff_name'
    );

    // Data row
    expect(lines[1]).toBe(
      'Alice Johnson,+13035551234,Free T-Shirt,Yes,1,2026-08-03T18:00:00Z,2026-08-03T18:05:00Z,2026-08-03T18:10:00Z,Jane Staff'
    );

    // Should have exactly 2 lines (header + 1 data row)
    expect(lines).toHaveLength(2);
  });

  it('escapes commas in values by wrapping in quotes', () => {
    const rowWithComma: CsvParticipantRow = {
      ...baseRow,
      prize_won: 'Win, Big!',
    };
    const result = toCsvString([rowWithComma]);
    const lines = result.split('\n');
    const dataLine = lines[1];

    // The prize_won field should be wrapped in quotes
    expect(dataLine).toContain('"Win, Big!"');
  });

  it('escapes quotes in values by doubling them and wrapping in quotes', () => {
    const rowWithQuotes: CsvParticipantRow = {
      ...baseRow,
      name: 'He said "Hi"',
    };
    const result = toCsvString([rowWithQuotes]);
    const lines = result.split('\n');
    const dataLine = lines[1];

    // Internal quotes should be doubled and the whole field wrapped in quotes
    expect(dataLine).toContain('"He said ""Hi"""');
  });

  it('outputs "Yes" or "No" for the fulfilled field', () => {
    const fulfilledRow: CsvParticipantRow = { ...baseRow, fulfilled: 'Yes' };
    const notFulfilledRow: CsvParticipantRow = { ...baseRow, fulfilled: 'No', queue_position: 2 };

    const result = toCsvString([fulfilledRow, notFulfilledRow]);
    const lines = result.split('\n');

    // First data row has fulfilled=Yes
    expect(lines[1]).toContain(',Yes,');

    // Second data row has fulfilled=No
    expect(lines[2]).toContain(',No,');
  });

  it('handles null values by outputting empty strings', () => {
    const rowWithNulls: CsvParticipantRow = {
      ...baseRow,
      spin_completed_at: null,
      fulfilled_at: null,
      fulfilled_by_staff_name: null,
    };
    const result = toCsvString([rowWithNulls]);
    const lines = result.split('\n');

    // Trailing null fields should be empty — the line ends with commas for empty values
    expect(lines[1]).toBe(
      'Alice Johnson,+13035551234,Free T-Shirt,Yes,1,2026-08-03T18:00:00Z,,,'
    );
  });

  it('handles newlines in values by wrapping in quotes', () => {
    const rowWithNewline: CsvParticipantRow = {
      ...baseRow,
      name: 'Line1\nLine2',
    };
    const result = toCsvString([rowWithNewline]);

    // The name field should be wrapped in quotes due to embedded newline
    expect(result).toContain('"Line1\nLine2"');
  });

  it('handles multiple rows correctly', () => {
    const row1: CsvParticipantRow = { ...baseRow, queue_position: 1 };
    const row2: CsvParticipantRow = {
      ...baseRow,
      name: 'Bob Smith',
      phone: '+13035555678',
      prize_won: '',
      fulfilled: 'No',
      queue_position: 2,
      spin_completed_at: null,
      fulfilled_at: null,
      fulfilled_by_staff_name: null,
    };

    const result = toCsvString([row1, row2]);
    const lines = result.split('\n');

    // Header + 2 data rows
    expect(lines).toHaveLength(3);
  });

  it('returns only the header for an empty array', () => {
    const result = toCsvString([]);
    expect(result).toBe(
      'name,phone,prize_won,fulfilled,queue_position,joined_at,spin_completed_at,fulfilled_at,fulfilled_by_staff_name'
    );
  });
});
