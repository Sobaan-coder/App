import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../config/env.dart';

/// Initializes Supabase. On Android/iOS the auth session is kept in the
/// platform's secure storage (Keystore/Keychain) instead of plain prefs.
Future<void> initSupabase() async {
  if (!Env.isConfigured) return;
  await Supabase.initialize(
    url: Env.supabaseUrl,
    publishableKey: Env.supabaseAnonKey, // anon (publishable) key — safe to ship, protected by RLS
    authOptions: FlutterAuthClientOptions(authFlowType: AuthFlowType.pkce, localStorage: kIsWeb ? null : SecureSessionStorage()),
  );
}

class SecureSessionStorage extends LocalStorage {
  SecureSessionStorage();
  static const _key = 'bp_supabase_session';
  final _storage = const FlutterSecureStorage();

  @override
  Future<void> initialize() async {}
  @override
  Future<bool> hasAccessToken() async => (await _storage.read(key: _key)) != null;
  @override
  Future<String?> accessToken() => _storage.read(key: _key);
  @override
  Future<void> persistSession(String persistSessionString) => _storage.write(key: _key, value: persistSessionString);
  @override
  Future<void> removePersistedSession() => _storage.delete(key: _key);
}

/// The Supabase client, or null when the app was built without configuration
/// (the app then shows setup instructions — it never falls back to fake data).
final supabaseClientProvider = Provider<SupabaseClient?>((ref) {
  if (!Env.isConfigured) return null;
  return Supabase.instance.client;
});

extension RequireClient on Ref {
  SupabaseClient get supabase {
    final c = read(supabaseClientProvider);
    if (c == null) throw StateError('Supabase is not configured');
    return c;
  }
}
