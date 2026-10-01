import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/config/env.dart';
import '../../../core/errors/app_failure.dart';
import '../../../core/services/supabase_service.dart';

class AuthRepository {
  AuthRepository(this._client);
  final SupabaseClient _client;

  String _redirect(String path) =>
      kIsWeb ? '${Uri.base.origin}$webBasePath${path.startsWith('/') ? path.substring(1) : path}' : Env.authRedirectMobile;

  Future<void> signIn(String email, String password) async {
    try {
      await _client.auth.signInWithPassword(email: email.trim(), password: password);
      await _client.rpc('accept_invitations');
    } catch (e) {
      throw AppFailure.from(e);
    }
  }

  /// Returns true when the user must confirm their email before signing in.
  Future<bool> signUp({required String name, required String email, required String password}) async {
    try {
      final res = await _client.auth.signUp(
        email: email.trim(),
        password: password,
        data: {'full_name': name.trim()},
        emailRedirectTo: _redirect('/'),
      );
      return res.session == null;
    } catch (e) {
      throw AppFailure.from(e);
    }
  }

  Future<void> signInWithGoogle() async {
    try {
      await _client.auth.signInWithOAuth(OAuthProvider.google, redirectTo: _redirect('/'));
    } catch (e) {
      throw AppFailure.from(e);
    }
  }

  Future<void> sendPasswordReset(String email) async {
    try {
      await _client.auth.resetPasswordForEmail(email.trim(), redirectTo: _redirect('/reset-password'));
    } catch (e) {
      throw AppFailure.from(e);
    }
  }

  Future<void> updatePassword(String password) async {
    try {
      await _client.auth.updateUser(UserAttributes(password: password));
    } catch (e) {
      throw AppFailure.from(e);
    }
  }

  Future<void> signOut() => _client.auth.signOut();
}

final authRepositoryProvider = Provider<AuthRepository>((ref) => AuthRepository(ref.supabase));

/// Auth events (sign in/out, token refresh, password recovery).
final authStateProvider = StreamProvider<AuthState?>((ref) {
  final client = ref.watch(supabaseClientProvider);
  if (client == null) return Stream.value(null);
  return client.auth.onAuthStateChange;
});

final currentUserProvider = Provider<User?>((ref) {
  ref.watch(authStateProvider);
  return ref.watch(supabaseClientProvider)?.auth.currentUser;
});
