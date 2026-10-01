import 'dart:typed_data';

import 'package:intl/intl.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import '../../../core/services/share_service.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/utils/money.dart';
import '../../business/domain/business.dart';
import '../../transactions/domain/transaction.dart';

/// Invoices are generated on-device (works offline) from server-confirmed data.
class InvoiceService {
  const InvoiceService._();

  /// WhatsApp-friendly text, shared through the native share sheet.
  static String buildText(AppTransaction tx, Business business, {String footer = 'Thank you!'}) {
    final lines = <String>[
      'Invoice ${tx.invoiceNumber ?? ''}'.trim(),
      '',
      business.name.toUpperCase(),
      '',
      if (tx.items.isEmpty) tx.title,
      for (final i in tx.items) '${Fmt.qty(i.quantity)} × ${i.name} — ${i.total.format()}',
      '',
      if (tx.discount != null && !tx.discount!.isZero) 'Discount: −${tx.discount!.format()}',
      if (tx.tax != null && !tx.tax!.isZero) 'Tax: ${tx.tax!.format()}',
      'Total: ${tx.amount.format()}',
      tx.paymentMethod == PaymentMethod.credit ? 'Status: Unpaid' : 'Status: Paid (${tx.paymentMethod.label})',
      '',
      footer,
    ];
    return lines.join('\n');
  }

  static Future<void> shareText(AppTransaction tx, ActiveBusiness active) => ShareService.shareText(
    buildText(tx, active.business, footer: active.settings.invoiceFooter),
    subject: 'Invoice ${tx.invoiceNumber ?? ''}',
  );

  static Future<Uint8List> buildPdf(
    AppTransaction tx,
    Business business, {
    String footer = 'Thank you for your business!',
  }) async {
    final doc = pw.Document(title: 'Invoice ${tx.invoiceNumber ?? ''}', author: business.name);
    pw.ImageProvider? logo;
    if (business.logoUrl != null) {
      try {
        logo = await networkImage(business.logoUrl!);
      } catch (_) {}
    }
    final brand = PdfColor.fromHex('#0E7C66');
    final muted = PdfColor.fromHex('#64748B');
    String m(Money? v) => v?.format() ?? '—';
    final subtotal =
        tx.subtotal ?? (tx.amount - (tx.tax ?? Money.zero(tx.amount.currency)) + (tx.discount ?? Money.zero(tx.amount.currency)));

    doc.addPage(
      pw.Page(
        pageFormat: PdfPageFormat.a4,
        margin: const pw.EdgeInsets.all(40),
        build: (ctx) => pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            pw.Row(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                if (logo != null)
                  pw.Container(width: 56, height: 56, margin: const pw.EdgeInsets.only(right: 12), child: pw.Image(logo)),
                pw.Expanded(
                  child: pw.Column(
                    crossAxisAlignment: pw.CrossAxisAlignment.start,
                    children: [
                      pw.Text(business.name, style: pw.TextStyle(fontSize: 20, fontWeight: pw.FontWeight.bold)),
                      if (business.address != null) pw.Text(business.address!, style: pw.TextStyle(color: muted)),
                      if (business.phone != null) pw.Text(business.phone!, style: pw.TextStyle(color: muted)),
                      if (business.email != null) pw.Text(business.email!, style: pw.TextStyle(color: muted)),
                    ],
                  ),
                ),
                pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.end,
                  children: [
                    pw.Text(
                      'INVOICE',
                      style: pw.TextStyle(fontSize: 24, fontWeight: pw.FontWeight.bold, color: brand),
                    ),
                    pw.SizedBox(height: 4),
                    pw.Text(tx.invoiceNumber ?? '—'),
                    pw.Text(DateFormat('d MMM yyyy').format(tx.transactionDate.toLocal()), style: pw.TextStyle(color: muted)),
                  ],
                ),
              ],
            ),
            pw.SizedBox(height: 28),
            pw.Text(
              'BILL TO',
              style: pw.TextStyle(fontSize: 10, color: muted, fontWeight: pw.FontWeight.bold),
            ),
            pw.Text(tx.customerName ?? 'Walk-in customer', style: const pw.TextStyle(fontSize: 13)),
            pw.SizedBox(height: 20),
            pw.TableHelper.fromTextArray(
              headers: ['Item', 'Qty', 'Price', 'Amount'],
              data: tx.items.isEmpty
                  ? [
                      [tx.title, '1', m(tx.amount), m(tx.amount)],
                    ]
                  : [
                      for (final i in tx.items) [i.name, Fmt.qty(i.quantity), m(i.unitPrice), m(i.total)],
                    ],
              headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold, color: PdfColors.white),
              headerDecoration: pw.BoxDecoration(color: brand),
              cellAlignments: {1: pw.Alignment.centerRight, 2: pw.Alignment.centerRight, 3: pw.Alignment.centerRight},
              border: null,
              rowDecoration: const pw.BoxDecoration(
                border: pw.Border(bottom: pw.BorderSide(color: PdfColors.grey300, width: .5)),
              ),
              cellPadding: const pw.EdgeInsets.symmetric(horizontal: 6, vertical: 8),
            ),
            pw.SizedBox(height: 16),
            pw.Align(
              alignment: pw.Alignment.centerRight,
              child: pw.SizedBox(
                width: 240,
                child: pw.Column(
                  children: [
                    _totalRow('Subtotal', m(subtotal)),
                    if (tx.discount != null && !tx.discount!.isZero) _totalRow('Discount', '− ${m(tx.discount)}'),
                    if (business.taxEnabled || (tx.tax != null && !tx.tax!.isZero)) _totalRow('Tax', m(tx.tax)),
                    pw.Divider(),
                    _totalRow('Total', m(tx.amount), bold: true),
                    pw.SizedBox(height: 6),
                    _totalRow(
                      'Payment status',
                      tx.paymentMethod == PaymentMethod.credit ? 'UNPAID' : 'PAID · ${tx.paymentMethod.label}',
                    ),
                  ],
                ),
              ),
            ),
            pw.Spacer(),
            pw.Divider(color: PdfColors.grey300),
            pw.Text(footer, style: pw.TextStyle(color: muted)),
            pw.Text('Generated with BusinessPilot', style: pw.TextStyle(color: muted, fontSize: 8)),
          ],
        ),
      ),
    );
    return doc.save();
  }

  static pw.Widget _totalRow(String label, String value, {bool bold = false}) => pw.Padding(
    padding: const pw.EdgeInsets.symmetric(vertical: 2),
    child: pw.Row(
      children: [
        pw.Expanded(
          child: pw.Text(label, style: pw.TextStyle(fontWeight: bold ? pw.FontWeight.bold : null)),
        ),
        pw.Text(
          value,
          style: pw.TextStyle(fontWeight: bold ? pw.FontWeight.bold : null, fontSize: bold ? 14 : 11),
        ),
      ],
    ),
  );

  static Future<void> sharePdf(AppTransaction tx, Business business, {String? footer}) async {
    final bytes = await buildPdf(tx, business, footer: footer ?? 'Thank you for your business!');
    await Printing.sharePdf(bytes: bytes, filename: 'invoice-${tx.invoiceNumber ?? tx.id.substring(0, 8)}.pdf');
  }

  static Future<void> printPdf(AppTransaction tx, Business business, {String? footer}) =>
      Printing.layoutPdf(onLayout: (_) => buildPdf(tx, business, footer: footer ?? 'Thank you for your business!'));
}
