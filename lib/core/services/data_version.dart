import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Bumped after every successful write. Read models (dashboard, lists,
/// reports) watch it so the UI refreshes immediately after recording.
class DataVersion extends Notifier<int> {
  @override
  int build() => 0;
  void bump() => state++;
}

final dataVersionProvider = NotifierProvider<DataVersion, int>(DataVersion.new);
