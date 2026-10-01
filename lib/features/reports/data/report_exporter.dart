import 'dart:convert';
import 'dart:typed_data';

import 'package:csv/csv.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../../../core/errors/app_failure.dart';
import '../../../core/services/analytics_service.dart';
import '../../../core/services/share_service.dart';
import '../../../core/services/supabase_service.dart';
import '../../../core/utils/date_range.dart';
import '../../../core/utils/money.dart';
import '../../business/data/business_repository.dart';

/// A simple tabular report that can be exported as CSV or PDF.
class ReportTable {
  const ReportTable({required this.title, required this.subtitle, required this.headers, required this.rows});
  final String title;
  final String subtitle;
  final List<String> headers;
  final List<List<String>> rows;

  String toCsv() => const ListToCsvConverter().convert([headers, ...rows]);

  Future<Uint8List> toPdf(String businessName) async {
    final doc = pw.Document(title: title, author: businessName);
    final brand = PdfColor.fromHex('#0E7C66');
    doc.addPage(pw.MultiPage(
      pageFormat: PdfPageFormat.a4.landscape,
      margin: const pw.EdgeInsets.all(28),
      header: (_) => pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
        pw.Text(businessName, style: pw.TextStyle(fontSize: 11, color: PdfColors.grey700)),
        pw.Text(title, style: pw.TextStyle(fontSize: 18, fontWeight: pw.FontWeight.bold, color: brand)),
        pw.Text(subtitle, style: const pw.TextStyle(fontSize: 10, color: PdfColors.grey700)),
        pw.SizedBox(height: 12),
      ]),
      footer: (ctx) => pw.Align(
        alignment: pw.Alignment.centerRight,
        child: pw.Text('Page ${ctx.pageNumber} of ${ctx.pagesCount} · BusinessPilot', style: const pw.TextStyle(fontSize: 8)),
      ),
      build: (_) => [
        pw.TableHelper.fromTextArray(
          headers: headers,
          data: rows,
          headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold, color: PdfColors.white, fontSize: 9),
          headerDecoration: pw.BoxDecoration(color: brand),
          cellStyle: const pw.TextStyle(fontSize: 8.5),
          cellPadding: const pw.EdgeInsets.all(4),
        ),
      ],
    ));
    return doc.save();
  }
}

class ReportExporter {
  ReportExporter(this.ref);
  final WidgetRef ref;

  /// Full ledger for a period, computed server-side in the business timezone.
  Future<ReportTable> ledger(DateFilter f) async {
    final b = ref.read(businessProvider);
    try {
      final rows = await ref.read(supabaseClientProvider)!.rpc('report_transactions',
          params: {'p_business_id': b.id, ...f.toRpcArgs()}) as List;
      return ReportTable(
        title: 'Transactions',
        subtitle: f.label,
        headers: const ['Date', 'Type', 'Invoice', 'Description', 'Items', 'Customer', 'Supplier', 'Category', 'Payment', 'Amount', 'Currency'],
        rows: [
          for (final r in rows.cast<Map>())
            [
              (r['transaction_date'] as String).substring(0, 10),
              r['type'] as String,
              r['invoice_number'] as String? ?? '',
              r['description'] as String? ?? '',
              r['items'] as String? ?? '',
              r['customer'] as String? ?? '',
              r['supplier'] as String? ?? '',
              r['category'] as String? ?? '',
              [r['payment_method'], r['payment_provider']].whereType<String>().join(' / '),
              Money(readMinor(r['amount_minor']) ?? 0, r['currency'] as String).toDecimalString(),
              r['currency'] as String,
            ],
        ],
      );
    } catch (e) {
      throw AppFailure.from(e);
    }
  }

  Future<void> shareCsv(ReportTable table, String filename) async {
    await ShareService.shareFile(Uint8List.fromList(utf8.encode(table.toCsv())), '$filename.csv', 'text/csv');
    _track('csv');
  }

  Future<void> sharePdf(ReportTable table, String filename) async {
    final bytes = await table.toPdf(ref.read(businessProvider).business.name);
    await ShareService.shareFile(bytes, '$filename.pdf', 'application/pdf');
    _track('pdf');
  }

  void _track(String format) => ref.read(analyticsProvider)
      .track('report_generated', businessId: ref.read(businessProvider).id, properties: {'format': format});
}
