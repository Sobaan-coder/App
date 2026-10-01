// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Urdu (`ur`).
class AppLocalizationsUr extends AppLocalizations {
  AppLocalizationsUr([String locale = 'ur']) : super(locale);

  @override
  String get appName => 'بزنس پائلٹ';

  @override
  String get tagline => 'Your Business. One Simple Conversation.';

  @override
  String get navHome => 'ہوم';

  @override
  String get navDashboard => 'Dashboard';

  @override
  String get navTransactions => 'لین دین';

  @override
  String get navAi => 'اے آئی';

  @override
  String get navAiAssistant => 'AI Assistant';

  @override
  String get navInventory => 'اسٹاک';

  @override
  String get navProducts => 'Products';

  @override
  String get navCustomers => 'Customers';

  @override
  String get navSuppliers => 'Suppliers';

  @override
  String get navExpenses => 'Expenses';

  @override
  String get navReports => 'Reports';

  @override
  String get navSettings => 'ترتیبات';

  @override
  String get navMore => 'مزید';

  @override
  String get navNotifications => 'Notifications';

  @override
  String get navHelp => 'Help & support';

  @override
  String get navSearch => 'Search';

  @override
  String get actionSave => 'محفوظ کریں';

  @override
  String get actionCancel => 'منسوخ';

  @override
  String get actionConfirm => 'تصدیق کریں';

  @override
  String get actionDelete => 'Delete';

  @override
  String get actionEdit => 'Edit';

  @override
  String get actionRetry => 'Try again';

  @override
  String get actionAdd => 'Add';

  @override
  String get actionDone => 'Done';

  @override
  String get actionNext => 'Next';

  @override
  String get actionBack => 'Back';

  @override
  String get actionSkip => 'Skip';

  @override
  String get actionShare => 'Share';

  @override
  String get actionExport => 'Export';

  @override
  String get actionUndo => 'Undo';

  @override
  String get actionRecord => 'Record';

  @override
  String get actionSignOut => 'Sign out';

  @override
  String get recordTransaction => 'Record transaction';

  @override
  String get authSignIn => 'Sign in';

  @override
  String get authSignUp => 'Create account';

  @override
  String get authEmail => 'Email';

  @override
  String get authPassword => 'Password';

  @override
  String get authFullName => 'Your name';

  @override
  String get authForgotPassword => 'Forgot password?';

  @override
  String get authResetPassword => 'Reset password';

  @override
  String get authNoAccount => 'New to BusinessPilot? Create an account';

  @override
  String get authHaveAccount => 'Already have an account? Sign in';

  @override
  String get authContinueGoogle => 'Continue with Google';

  @override
  String get authCheckEmail =>
      'Check your email to confirm your account, then sign in.';

  @override
  String get authResetSent =>
      'If an account exists for that email, we\'ve sent a reset link.';

  @override
  String get aiHeader => 'بتائیں کیا ہوا؟';

  @override
  String get aiHint => 'کیا ہوا؟';

  @override
  String get aiDashboardPrompt => 'آج کیا ہوا؟';

  @override
  String get aiThinking => 'Understanding…';

  @override
  String get aiRecorded => 'Recorded';

  @override
  String get aiOffline =>
      'You\'re offline. The assistant needs internet — use the + button to add entries and they\'ll sync later.';

  @override
  String get dashSales => 'فروخت';

  @override
  String get dashExpenses => 'اخراجات';

  @override
  String get dashProfit => 'منافع';

  @override
  String get dashReceivables => 'Customers owe you';

  @override
  String get dashPayables => 'You owe suppliers';

  @override
  String get dashLowStock => 'Low stock';

  @override
  String get dashRecent => 'Recent transactions';

  @override
  String get dashTopProducts => 'Top products';

  @override
  String get dashSalesTrend => 'Sales trend';

  @override
  String get dashExpenseBreakdown => 'Where money went';

  @override
  String get dashProfitUnavailable =>
      'Profit estimate unavailable because product cost data is incomplete.';

  @override
  String get emptyGeneric => 'Nothing here yet';

  @override
  String get errorGeneric => 'Something went wrong. Please try again.';

  @override
  String get offlineBanner =>
      'Offline — showing saved data. New entries will sync automatically.';

  @override
  String pendingSync(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count entries waiting to sync',
      one: '1 entry waiting to sync',
    );
    return '$_temp0';
  }

  @override
  String greeting(String name) {
    return 'Hello, $name';
  }
}
