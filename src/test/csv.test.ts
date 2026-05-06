import { describe, expect, it } from 'vitest';
import { escapeCsvField, toCsv } from '@/lib/csv';

describe('csv helpers', () => {
  it('escapes commas, quotes and line breaks', () => {
    expect(escapeCsvField('Retifica, Premium')).toBe('"Retifica, Premium"');
    expect(escapeCsvField('Motor "AP"')).toBe('"Motor ""AP"""');
    expect(escapeCsvField('linha 1\nlinha 2')).toBe('"linha 1\nlinha 2"');
  });

  it('protects spreadsheet formula injection', () => {
    expect(escapeCsvField('=IMPORTXML("https://evil.test")')).toBe('"\'=IMPORTXML(""https://evil.test"")"');
    expect(escapeCsvField('+123')).toBe("'+123");
    expect(escapeCsvField('-10')).toBe("'-10");
    expect(escapeCsvField('@cmd')).toBe("'@cmd");
  });

  it('creates a deterministic csv with explicit columns', () => {
    expect(toCsv([
      { os: 'OS-1', cliente: 'Joao', total: 10.5 },
      { os: 'OS-2', cliente: 'Maria', total: 20 },
    ], ['os', 'cliente', 'total'])).toBe([
      'os,cliente,total',
      'OS-1,Joao,10.5',
      'OS-2,Maria,20',
    ].join('\n'));
  });
});
