class AppConstants {
  const AppConstants._();

  static const appName = 'BusinessPilot';
  static const tagline = 'Your Business. One Simple Conversation.';
  static const pageSize = 30;

  static const currencies = <String>[
    'PKR',
    'USD',
    'GBP',
    'EUR',
    'AED',
    'SAR',
    'INR',
    'BDT',
    'QAR',
    'KWD',
    'OMR',
    'BHD',
    'CAD',
    'AUD',
    'NGN',
    'KES',
    'ZAR',
    'EGP',
    'TRY',
    'MYR',
    'IDR',
    'PHP',
    'LKR',
    'NPR',
    'JPY',
  ];

  /// Sensible timezone default for each currency; always editable.
  static const currencyTimezones = <String, String>{
    'PKR': 'Asia/Karachi',
    'USD': 'America/New_York',
    'GBP': 'Europe/London',
    'EUR': 'Europe/Berlin',
    'AED': 'Asia/Dubai',
    'SAR': 'Asia/Riyadh',
    'INR': 'Asia/Kolkata',
    'BDT': 'Asia/Dhaka',
    'QAR': 'Asia/Qatar',
    'KWD': 'Asia/Kuwait',
    'OMR': 'Asia/Muscat',
    'BHD': 'Asia/Bahrain',
    'CAD': 'America/Toronto',
    'AUD': 'Australia/Sydney',
    'NGN': 'Africa/Lagos',
    'KES': 'Africa/Nairobi',
    'ZAR': 'Africa/Johannesburg',
    'EGP': 'Africa/Cairo',
    'TRY': 'Europe/Istanbul',
    'MYR': 'Asia/Kuala_Lumpur',
    'IDR': 'Asia/Jakarta',
    'PHP': 'Asia/Manila',
    'LKR': 'Asia/Colombo',
    'NPR': 'Asia/Kathmandu',
    'JPY': 'Asia/Tokyo',
  };

  static const timezones = <String>[
    'Asia/Karachi',
    'Asia/Dubai',
    'Asia/Riyadh',
    'Asia/Kolkata',
    'Asia/Dhaka',
    'Asia/Qatar',
    'Asia/Kuwait',
    'Asia/Muscat',
    'Asia/Bahrain',
    'Asia/Kathmandu',
    'Asia/Colombo',
    'Asia/Kuala_Lumpur',
    'Asia/Jakarta',
    'Asia/Manila',
    'Asia/Tokyo',
    'Europe/London',
    'Europe/Berlin',
    'Europe/Paris',
    'Europe/Istanbul',
    'Africa/Lagos',
    'Africa/Nairobi',
    'Africa/Johannesburg',
    'Africa/Cairo',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Toronto',
    'Australia/Sydney',
    'UTC',
  ];

  static const businessTypes = <String, String>{
    'restaurant': 'Restaurant',
    'cafe': 'Cafe',
    'bakery': 'Bakery',
    'grocery': 'Grocery store',
    'clothing': 'Clothing shop',
    'electronics': 'Electronics shop',
    'salon': 'Salon',
    'freelancer': 'Freelancer / services',
    'wholesale': 'Wholesaler',
    'retail': 'Retail store',
    'home_business': 'Home business',
    'other': 'Other',
  };

  static const units = <String>['pcs', 'kg', 'g', 'l', 'ml', 'box', 'pack', 'dozen', 'm', 'hour', 'service'];

  static const aiExamples = <String>[
    'Sold 3 burgers for Rs 1200 cash',
    'Bought chicken for Rs 5000',
    'Ahmed owes me Rs 2000',
    'Paid electricity Rs 4500',
    'How much did I sell today?',
  ];
}
