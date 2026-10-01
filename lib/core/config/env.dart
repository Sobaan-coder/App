/// Build-time configuration, injected with --dart-define / --dart-define-from-file.
///
/// Only PUBLIC, client-safe values belong here. The Supabase anon key is safe
/// to ship (Row Level Security protects the data). AI keys, the service-role
/// key and payment secrets live only in Supabase secrets (server side).
class Env {
  const Env._();

  static const supabaseUrl = String.fromEnvironment('SUPABASE_URL');
  static const supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');
  static const appEnv = String.fromEnvironment('APP_ENV', defaultValue: 'development');
  static const siteUrl = String.fromEnvironment('SITE_URL', defaultValue: 'https://businesspilot.app');
  static const supportEmail = String.fromEnvironment('SUPPORT_EMAIL', defaultValue: 'support@businesspilot.app');
  static const privacyUrl = String.fromEnvironment('PRIVACY_URL', defaultValue: 'https://businesspilot.app/privacy');
  static const termsUrl = String.fromEnvironment('TERMS_URL', defaultValue: 'https://businesspilot.app/terms');

  /// Deep-link / OAuth redirect used by Supabase Auth on mobile.
  static const authRedirectMobile = 'com.businesspilot.app://login-callback';

  static bool get isConfigured => supabaseUrl.isNotEmpty && supabaseAnonKey.isNotEmpty;
  static bool get isProduction => appEnv == 'production';
}

/// Where the Flutter web app is served from (e.g. "/app/" behind the landing site).
const webBasePath = String.fromEnvironment('WEB_BASE_PATH', defaultValue: '/');
