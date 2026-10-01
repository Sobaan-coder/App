import 'package:businesspilot/features/import_export/data/csv_import.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('templates parse back cleanly', () {
    for (final k in ImportKind.values) {
      final p = CsvImporter.parse(k, k.template(), 'PKR');
      expect(p.fileErrors, isEmpty, reason: k.name);
      expect(p.validCount, 1, reason: k.name);
    }
  });

  test('validates rows before anything is written', () {
    const csv =
        'name,selling_price,cost_price,opening_stock\n'
        'Burger,500,280,50\n'
        ',100,,\n'
        'Pizza,abc,,\n'
        'Burger,600,,\n';
    final p = CsvImporter.parse(ImportKind.products, csv, 'PKR');
    expect(p.validCount, 1);
    expect(p.errorCount, 3);
    expect(p.rows[1].errors, contains('Name is required'));
    expect(p.rows[2].errors.single, contains('not a valid amount'));
    expect(p.rows[3].errors, contains('Duplicate name in file'));
    expect(p.rows.first.values['selling_price'].minor, 50000);
  });

  test('opening balances require party type and positive amount', () {
    const csv = 'party_type,name,amount\ncustomer,Ali,3000\nfriend,Bob,10\nsupplier,Poultry,0\n';
    final p = CsvImporter.parse(ImportKind.openingBalances, csv, 'PKR');
    expect(p.validCount, 1);
    expect(p.rows[1].errors.single, contains('party_type'));
    expect(p.rows[2].errors.single, contains('more than zero'));
  });

  test('missing columns produce a clear file error', () {
    final p = CsvImporter.parse(ImportKind.customers, 'phone\n123\n', 'PKR');
    expect(p.fileErrors.single, contains('Missing required column'));
    expect(p.canImport, isFalse);
  });

  test('handles BOM-less CRLF files and blank lines', () {
    final p = CsvImporter.parse(ImportKind.customers, 'name,phone\r\nAli,123\r\n\r\nSara,456\r\n', 'PKR');
    expect(p.validCount, 2);
  });
}
