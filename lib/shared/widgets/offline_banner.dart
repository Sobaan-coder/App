import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/services/connectivity_service.dart';
import '../../core/services/offline_queue.dart';
import '../../core/utils/l10n_x.dart';

/// Shows connectivity + sync status at the top of the app shell.
class OfflineBanner extends ConsumerWidget {
  const OfflineBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final online = ref.watch(isOnlineProvider);
    final pending = ref.watch(offlineQueueProvider);
    final waiting = pending.where((p) => !p.failed).length;
    final failed = pending.where((p) => p.failed).length;
    final t = Theme.of(context);
    if (online && pending.isEmpty) return const SizedBox.shrink();
    final text = !online
        ? (waiting > 0 ? '${context.l10n.offlineBanner} ${context.l10n.pendingSync(waiting)}.' : context.l10n.offlineBanner)
        : failed > 0
        ? '$failed offline ${failed == 1 ? 'entry needs' : 'entries need'} your attention.'
        : '${context.l10n.pendingSync(waiting)}…';
    return Material(
      color: !online ? t.colorScheme.inverseSurface : t.colorScheme.secondaryContainer,
      child: SafeArea(
        bottom: false,
        child: Semantics(
          liveRegion: true,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                Icon(
                  online ? Icons.sync_rounded : Icons.cloud_off_rounded,
                  size: 18,
                  color: !online ? t.colorScheme.onInverseSurface : t.colorScheme.onSecondaryContainer,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    text,
                    style: t.textTheme.bodySmall?.copyWith(
                      color: !online ? t.colorScheme.onInverseSurface : t.colorScheme.onSecondaryContainer,
                    ),
                  ),
                ),
                if (online && pending.isNotEmpty)
                  TextButton(
                    onPressed: () => failed > 0 ? _showFailed(context, ref) : ref.read(offlineQueueProvider.notifier).sync(),
                    child: Text(failed > 0 ? 'Review' : 'Sync now'),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _showFailed(BuildContext context, WidgetRef ref) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => Consumer(
        builder: (ctx, ref, _) {
          final ops = ref.watch(offlineQueueProvider).where((o) => o.failed).toList();
          return ListView(
            shrinkWrap: true,
            padding: const EdgeInsets.all(16),
            children: [
              Text('Entries that could not be synced', style: Theme.of(ctx).textTheme.titleMedium),
              const SizedBox(height: 8),
              for (final op in ops)
                ListTile(
                  title: Text(op.summary),
                  subtitle: Text(op.error ?? ''),
                  trailing: Wrap(
                    children: [
                      IconButton(
                        tooltip: 'Retry',
                        icon: const Icon(Icons.refresh_rounded),
                        onPressed: () => ref.read(offlineQueueProvider.notifier).retry(op.id),
                      ),
                      IconButton(
                        tooltip: 'Discard',
                        icon: const Icon(Icons.delete_outline_rounded),
                        onPressed: () => ref.read(offlineQueueProvider.notifier).discard(op.id),
                      ),
                    ],
                  ),
                ),
              if (ops.isEmpty) const Padding(padding: EdgeInsets.all(16), child: Text('All synced.')),
            ],
          );
        },
      ),
    );
  }
}
