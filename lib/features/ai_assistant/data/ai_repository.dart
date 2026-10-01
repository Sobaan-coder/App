import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/services/supabase_service.dart';
import '../domain/ai_proposal.dart';

/// Talks to the ai-process / ai-query Edge Functions. API keys never exist on
/// the device; the functions authenticate the user with their JWT.
class AiRepository {
  AiRepository(this._client);
  final SupabaseClient _client;

  Future<AiProposal> process(String businessId, String text, {bool queryOnly = false}) async {
    try {
      final res = await _client.functions.invoke(
        queryOnly ? 'ai-query' : 'ai-process',
        body: {'business_id': businessId, 'text': text},
      );
      final data = res.data;
      if (data is! Map) return AiProposal.error('The assistant returned something unexpected. Nothing was recorded.');
      return AiProposal.fromJson(Map<String, dynamic>.from(data));
    } catch (e) {
      throw AppFailure.from(e);
    }
  }

  /// Receipt scanning: the image is uploaded to the private receipts bucket,
  /// then parsed server-side. Results always require confirmation.
  Future<AiProposal> processReceipt(String businessId, Uint8List bytes, String ext) async {
    try {
      final path = '$businessId/${DateTime.now().millisecondsSinceEpoch}.$ext';
      await _client.storage
          .from('receipts')
          .uploadBinary(path, bytes, fileOptions: FileOptions(contentType: ext == 'png' ? 'image/png' : 'image/jpeg'));
      final res = await _client.functions.invoke(
        'ai-process',
        body: {'business_id': businessId, 'mode': 'receipt', 'storage_path': path},
      );
      return AiProposal.fromJson(Map<String, dynamic>.from(res.data as Map));
    } catch (e) {
      throw AppFailure.from(e);
    }
  }
}

final aiRepositoryProvider = Provider<AiRepository>((ref) => AiRepository(ref.supabase));
