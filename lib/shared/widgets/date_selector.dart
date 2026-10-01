import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

class DateSelector extends StatelessWidget {
  const DateSelector({super.key, required this.value, required this.onChanged, this.label = 'Date'});
  final DateTime value;
  final ValueChanged<DateTime> onChanged;
  final String label;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: () async {
        final now = DateTime.now();
        final d = await showDatePicker(
          context: context,
          initialDate: value,
          firstDate: DateTime(now.year - 5),
          lastDate: now,
        );
        if (d != null) {
          // Keep the current time of day so ordering within a day stays natural.
          onChanged(DateTime(d.year, d.month, d.day, value.hour, value.minute));
        }
      },
      child: InputDecorator(
        decoration: InputDecoration(labelText: label, prefixIcon: const Icon(Icons.event_rounded)),
        child: Text(DateFormat('EEE, d MMM yyyy').format(value)),
      ),
    );
  }
}
