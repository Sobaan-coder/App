import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/utils/money.dart';

/// Amount input that produces exact integer minor units (no doubles).
class MoneyField extends StatelessWidget {
  const MoneyField({
    super.key,
    required this.controller,
    required this.currency,
    this.label = 'Amount',
    this.required = true,
    this.allowZero = false,
    this.autofocus = false,
    this.onChanged,
    this.helper,
  });

  final TextEditingController controller;
  final String currency;
  final String label;
  final bool required;
  final bool allowZero;
  final bool autofocus;
  final ValueChanged<Money?>? onChanged;
  final String? helper;

  static Money? read(TextEditingController c, String currency) =>
      c.text.trim().isEmpty ? null : Money.tryParse(c.text, currency);

  @override
  Widget build(BuildContext context) {
    final digits = Money.digitsFor(currency);
    return TextFormField(
      controller: controller,
      autofocus: autofocus,
      keyboardType: TextInputType.numberWithOptions(decimal: digits > 0),
      inputFormatters: [FilteringTextInputFormatter.allow(RegExp(digits > 0 ? r'[0-9.,]' : r'[0-9,]'))],
      style: Theme.of(context).textTheme.titleMedium,
      decoration: InputDecoration(
        labelText: label,
        helperText: helper,
        prefixText: '${Money.symbolFor(currency)} ',
      ),
      onChanged: onChanged == null ? null : (v) => onChanged!(Money.tryParse(v, currency)),
      validator: (v) {
        if (v == null || v.trim().isEmpty) return required ? '$label is required' : null;
        final m = Money.tryParse(v, currency);
        if (m == null) return 'Enter a valid amount (max $digits decimals)';
        if (!allowZero && m.minor <= 0) return '$label must be more than zero';
        return null;
      },
    );
  }
}
