import 'package:csv/csv.dart';

import '../../../core/utils/money.dart';

enum ImportKind {
  products('Products', ['name', 'selling_price', 'cost_price', 'unit', 'sku', 'barcode', 'opening_stock', 'minimum_stock'],
      ['Burger', '500', '280', 'pcs', 'BRG-01', '', '50', '10']),
  customers('Customers', ['name', 'phone', 'email', 'address', 'notes'], ['Ali Khan', '+92 300 1234567', '', 'Gulberg, Lahore', '']),
  suppliers('Suppliers', ['name', 'phone', 'email', 'address', 'notes'], ['Fresh Poultry', '+92 42 111 222', '', '', '']),
  openingBalances('Opening balances', ['party_type', 'name', 'amount', 'note'], ['customer', 'Ali Khan', '3000', 'Balance from old notebook']);

  const ImportKind(this.label, this.columns, this.example);
  final String label;
  final List<String> columns;
  final List<String> example;

  String template() => const ListToCsvConverter().convert([columns, example]);
}

class ImportRow {
  const ImportRow(this.line, this.values, this.errors);
  final int line;
  final Map<String, dynamic> values;
  final List<String> errors;
  bool get ok => errors.isEmpty;
}

class ImportPreview {
  const ImportPreview(this.kind, this.rows, this.fileErrors);
  final ImportKind kind;
  final List<ImportRow> rows;
  final List<String> fileErrors;
  int get validCount => rows.where((r) => r.ok).length;
  int get errorCount => rows.where((r) => !r.ok).length;
  bool get canImport => fileErrors.isEmpty && validCount > 0;
}

/// Parses and validates a CSV completely BEFORE anything is written.
class CsvImporter {
  const CsvImporter._();
  static const maxRows = 2000;

  static ImportPreview parse(ImportKind kind, String csvText, String currency) {
    final table = const CsvToListConverter(shouldParseNumbers: false, eol: '\n')
        .convert(csvText.replaceAll('\r\n', '\n').replaceAll('\r', '\n'));
    final nonEmpty = table.where((r) => r.any((c) => c.toString().trim().isNotEmpty)).toList();
    if (nonEmpty.isEmpty) return ImportPreview(kind, const [], const ['The file is empty.']);
    final header = nonEmpty.first.map((h) => h.toString().trim().toLowerCase().replaceAll(' ', '_')).toList();
    final missing = kind.columns.where((c) => c == 'name' && !header.contains(c)).toList();
    if (missing.isNotEmpty || (kind == ImportKind.openingBalances && !header.contains('amount'))) {
      return ImportPreview(kind, const [], ['Missing required column(s). Expected: ${kind.columns.join(', ')}. Download the template.']);
    }
    if (nonEmpty.length - 1 > maxRows) return ImportPreview(kind, const [], ['Too many rows (max $maxRows per file).']);

    final seen = <String>{};
    final rows = <ImportRow>[];
    for (var i = 1; i < nonEmpty.length; i++) {
      final raw = <String, String>{
        for (var c = 0; c < header.length; c++) header[c]: c < nonEmpty[i].length ? nonEmpty[i][c].toString().trim() : '',
      };
      final errors = <String>[];
      final v = <String, dynamic>{};
      final name = raw['name'] ?? '';
      if (name.isEmpty) errors.add('Name is required');
      if (name.length > 120) errors.add('Name is too long');
      v['name'] = name;
      if (name.isNotEmpty && !seen.add('${raw['party_type'] ?? ''}:${name.toLowerCase()}')) errors.add('Duplicate name in file');

      Money? money(String col, {bool required = false}) {
        final s = raw[col] ?? '';
        if (s.isEmpty) {
          if (required) errors.add('$col is required');
          return null;
        }
        final m = Money.tryParse(s, currency);
        if (m == null || m.minor < 0) errors.add('$col “$s” is not a valid amount');
        return m;
      }

      double? number(String col) {
        final s = raw[col] ?? '';
        if (s.isEmpty) return null;
        final d = double.tryParse(s);
        if (d == null || d < 0) errors.add('$col “$s” is not a valid number');
        return d;
      }

      switch (kind) {
        case ImportKind.products:
          v['selling_price'] = money('selling_price');
          v['cost_price'] = money('cost_price');
          v['unit'] = (raw['unit'] ?? '').isEmpty ? 'pcs' : raw['unit'];
          v['sku'] = (raw['sku'] ?? '').isEmpty ? null : raw['sku'];
          v['barcode'] = (raw['barcode'] ?? '').isEmpty ? null : raw['barcode'];
          v['opening_stock'] = number('opening_stock') ?? 0;
          v['minimum_stock'] = number('minimum_stock') ?? 0;
        case ImportKind.customers:
        case ImportKind.suppliers:
          for (final f in ['phone', 'email', 'address', 'notes']) {
            v[f] = (raw[f] ?? '').isEmpty ? null : raw[f];
          }
          final email = v['email'] as String?;
          if (email != null && !RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(email)) errors.add('Invalid email');
        case ImportKind.openingBalances:
          final type = (raw['party_type'] ?? '').toLowerCase();
          if (type != 'customer' && type != 'supplier') errors.add('party_type must be “customer” or “supplier”');
          v['party_type'] = type;
          final amount = money('amount', required: true);
          if (amount != null && amount.minor == 0) errors.add('Amount must be more than zero');
          v['amount'] = amount;
          v['note'] = (raw['note'] ?? '').isEmpty ? 'Opening balance' : raw['note'];
      }
      rows.add(ImportRow(i + 1, v, errors));
    }
    return ImportPreview(kind, rows, const []);
  }
}
