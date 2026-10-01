import 'package:flutter/material.dart';

enum MovementType {
  opening('Opening stock', Icons.flag_rounded),
  purchase('Purchase', Icons.add_shopping_cart_rounded),
  sale('Sale', Icons.point_of_sale_rounded),
  waste('Waste', Icons.delete_sweep_rounded),
  damage('Damage', Icons.broken_image_rounded),
  return_('Return', Icons.assignment_return_rounded),
  adjustment('Adjustment', Icons.tune_rounded),
  transfer('Transfer', Icons.swap_horiz_rounded);

  const MovementType(this.label, this.icon);
  final String label;
  final IconData icon;

  String get api => this == return_ ? 'return' : name;
  static MovementType fromApi(String v) => values.firstWhere((t) => t.api == v, orElse: () => adjustment);

  /// Types a user can record by hand (sales/purchases come from transactions).
  static const manual = [waste, damage, return_, adjustment, opening, transfer];
}

class InventoryMovement {
  const InventoryMovement({required this.id, required this.type, required this.change, required this.createdAt, this.note});
  final String id;
  final MovementType type;
  final double change;
  final DateTime createdAt;
  final String? note;

  factory InventoryMovement.fromJson(Map<String, dynamic> j) => InventoryMovement(
    id: j['id'] as String,
    type: MovementType.fromApi(j['type'] as String),
    change: (j['quantity_change'] as num).toDouble(),
    createdAt: DateTime.parse(j['created_at'] as String),
    note: j['note'] as String?,
  );
}
