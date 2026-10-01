import '../../../core/utils/money.dart';

class Product {
  const Product({
    required this.id,
    required this.businessId,
    required this.name,
    required this.currency,
    this.categoryId,
    this.sku,
    this.description,
    this.sellingPrice,
    this.costPrice,
    this.stockQuantity = 0,
    this.minimumStock = 0,
    this.unit = 'pcs',
    this.barcode,
    this.imageUrl,
    this.trackInventory = true,
    this.isActive = true,
  });

  final String id;
  final String businessId;
  final String? categoryId;
  final String name;
  final String currency;
  final String? sku;
  final String? description;
  final Money? sellingPrice;
  final Money? costPrice;
  final double stockQuantity;
  final double minimumStock;
  final String unit;
  final String? barcode;
  final String? imageUrl;
  final bool trackInventory;
  final bool isActive;

  bool get isLowStock => trackInventory && minimumStock > 0 && stockQuantity <= minimumStock;
  bool get isOutOfStock => trackInventory && stockQuantity <= 0;

  /// Margin in basis points, or null when cost/price is unknown.
  int? get marginBp {
    if (sellingPrice == null || costPrice == null || sellingPrice!.minor == 0) return null;
    return ((sellingPrice!.minor - costPrice!.minor) * 10000 / sellingPrice!.minor).round();
  }

  factory Product.fromJson(Map<String, dynamic> j, String currency) {
    Money? m(String k) => readMinor(j[k]) == null ? null : Money(readMinor(j[k])!, currency);
    return Product(
      id: j['id'] as String,
      businessId: j['business_id'] as String,
      categoryId: j['category_id'] as String?,
      name: j['name'] as String,
      currency: currency,
      sku: j['sku'] as String?,
      description: j['description'] as String?,
      sellingPrice: m('selling_price_minor'),
      costPrice: m('cost_price_minor'),
      stockQuantity: readQty(j['stock_quantity']),
      minimumStock: readQty(j['minimum_stock']),
      unit: j['unit'] as String? ?? 'pcs',
      barcode: j['barcode'] as String?,
      imageUrl: j['image_url'] as String?,
      trackInventory: j['track_inventory'] as bool? ?? true,
      isActive: j['is_active'] as bool? ?? true,
    );
  }

  Map<String, dynamic> toWritableJson() => {
    'name': name.trim(),
    'category_id': categoryId,
    'sku': (sku?.trim().isEmpty ?? true) ? null : sku!.trim(),
    'description': description,
    'selling_price_minor': sellingPrice?.minor,
    'cost_price_minor': costPrice?.minor,
    'minimum_stock': minimumStock,
    'unit': unit,
    'barcode': (barcode?.trim().isEmpty ?? true) ? null : barcode!.trim(),
    'image_url': imageUrl,
    'track_inventory': trackInventory,
    'is_active': isActive,
  };
}

class ProductCategory {
  const ProductCategory(this.id, this.name);
  final String id;
  final String name;
}
