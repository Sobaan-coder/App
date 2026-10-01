import 'dart:convert';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../../core/services/share_service.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/money.dart';
import '../../../shared/widgets/app_button.dart';
import '../../../shared/widgets/states.dart';
import '../../business/data/business_repository.dart';
import '../../customers/data/contact_repository.dart';
import '../../customers/domain/contact.dart';
import '../../products/data/product_repository.dart';
import '../../products/domain/product.dart';
import '../../settings/presentation/settings_screen.dart';
import '../../transactions/data/transaction_repository.dart';
import '../../transactions/domain/transaction.dart';
import '../data/csv_import.dart';

class ImportExportScreen extends ConsumerStatefulWidget {
  const ImportExportScreen({super.key});
  @override
  ConsumerState<ImportExportScreen> createState() => _ImportExportScreenState();
}

class _ImportExportScreenState extends ConsumerState<ImportExportScreen> {
  ImportKind _kind = ImportKind.products;
  ImportPreview? _preview;
  bool _importing = false;
  int _done = 0;

  Future<void> _pick() async {
    final res = await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: ['csv'], withData: true);
    final bytes = res?.files.singleOrNull?.bytes;
    if (bytes == null) return;
    final text = utf8.decode(bytes, allowMalformed: true).replaceFirst('﻿', '');
    setState(() => _preview = CsvImporter.parse(_kind, text, ref.read(businessProvider).currency));
  }

  Future<void> _import() async {
    final p = _preview;
    if (p == null || !p.canImport) return;
    setState(() {
      _importing = true;
      _done = 0;
    });
    final b = ref.read(businessProvider);
    try {
      for (final row in p.rows.where((r) => r.ok)) {
        final v = row.values;
        switch (p.kind) {
          case ImportKind.products:
            await ref
                .read(productRepositoryProvider)
                .create(
                  Product(
                    id: '',
                    businessId: b.id,
                    name: v['name'] as String,
                    currency: b.currency,
                    sellingPrice: v['selling_price'] as Money?,
                    costPrice: v['cost_price'] as Money?,
                    unit: v['unit'] as String,
                    sku: v['sku'] as String?,
                    barcode: v['barcode'] as String?,
                    minimumStock: v['minimum_stock'] as double,
                  ),
                  openingStock: v['opening_stock'] as double,
                );
          case ImportKind.customers:
          case ImportKind.suppliers:
            await ref.read(contactRepositoryProvider).create(
              p.kind == ImportKind.customers ? ContactKind.customer : ContactKind.supplier,
              {
                for (final f in ['name', 'phone', 'email', 'address', 'notes']) f: v[f],
              },
            );
          case ImportKind.openingBalances:
            final customer = v['party_type'] == 'customer';
            await ref
                .read(transactionRepositoryProvider)
                .record(
                  TransactionDraft(
                    type: TransactionType.adjustment,
                    amount: v['amount'] as Money,
                    paymentMethod: PaymentMethod.credit,
                    description: v['note'] as String,
                    customerName: customer ? v['name'] as String : null,
                    createCustomer: customer,
                    supplierName: customer ? null : v['name'] as String,
                    createSupplier: !customer,
                    source: 'import',
                  ),
                  clientRef: const Uuid().v5(Namespace.url.value, '${b.id}:opening:${v['party_type']}:${v['name']}'),
                );
        }
        setState(() => _done++);
      }
      if (mounted) {
        showMessage(context, 'Imported $_done ${p.kind.label.toLowerCase()}.');
        setState(() => _preview = null);
      }
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _importing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final b = ref.watch(businessProvider);
    final p = _preview;
    final t = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Import & export')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 760),
          child: ListView(
            padding: const EdgeInsets.all(Gap.lg),
            children: [
              Text('Import from CSV', style: t.textTheme.titleLarge),
              const SizedBox(height: Gap.sm),
              const Text(
                'Download a template, fill it in (Excel or Google Sheets → “Save as CSV”), then upload. '
                'Everything is checked before anything is saved.',
              ),
              const SizedBox(height: Gap.lg),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final k in ImportKind.values)
                    ChoiceChip(
                      label: Text(k.label),
                      selected: _kind == k,
                      onSelected: (_) => setState(() {
                        _kind = k;
                        _preview = null;
                      }),
                    ),
                ],
              ),
              const SizedBox(height: Gap.lg),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  OutlinedButton.icon(
                    onPressed: () => ShareService.shareFile(
                      Uint8List.fromList(utf8.encode(_kind.template())),
                      'businesspilot-${_kind.name}-template.csv',
                      'text/csv',
                    ),
                    icon: const Icon(Icons.download_rounded),
                    label: const Text('Download template'),
                  ),
                  FilledButton.icon(
                    onPressed: b.role.canEditCatalogue ? _pick : null,
                    icon: const Icon(Icons.upload_file_rounded),
                    label: const Text('Choose CSV file'),
                  ),
                ],
              ),
              if (!b.role.canEditCatalogue)
                const Padding(padding: EdgeInsets.only(top: 8), child: Text('Importing needs Manager access or higher.')),
              if (p != null) ...[
                const SizedBox(height: Gap.xl),
                if (p.fileErrors.isNotEmpty)
                  for (final e in p.fileErrors)
                    ListTile(
                      leading: Icon(Icons.error_outline, color: t.colorScheme.error),
                      title: Text(e),
                    )
                else ...[
                  Text('${p.validCount} ready to import · ${p.errorCount} with errors', style: t.textTheme.titleMedium),
                  const SizedBox(height: Gap.sm),
                  for (final r in p.rows.take(200))
                    ListTile(
                      dense: true,
                      leading: Icon(
                        r.ok ? Icons.check_circle_outline : Icons.error_outline,
                        color: r.ok ? t.colorScheme.primary : t.colorScheme.error,
                      ),
                      title: Text('Row ${r.line}: ${r.values['name']}'),
                      subtitle: r.ok ? null : Text(r.errors.join(' · '), style: TextStyle(color: t.colorScheme.error)),
                    ),
                  const SizedBox(height: Gap.lg),
                  AppButton(
                    label: _importing ? 'Importing $_done / ${p.validCount}…' : 'Import ${p.validCount} rows',
                    loading: _importing,
                    onPressed: p.canImport ? _import : null,
                    expand: true,
                  ),
                  if (p.errorCount > 0)
                    const Padding(
                      padding: EdgeInsets.only(top: 8),
                      child: Text('Rows with errors will be skipped. Fix them and import again.'),
                    ),
                ],
              ],
              const Divider(height: 48),
              Text('Export', style: t.textTheme.titleLarge),
              const SizedBox(height: Gap.sm),
              const Text('Reports can be exported as CSV or PDF from the Reports screen.'),
              const SizedBox(height: Gap.lg),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.cloud_download_outlined),
                title: const Text('Export my data'),
                subtitle: const Text('Everything for this business as a JSON file (owner/admin).'),
                trailing: FilledButton.tonal(
                  onPressed: b.role.canExport ? () => exportMyData(context, ref) : null,
                  child: const Text('Export'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
