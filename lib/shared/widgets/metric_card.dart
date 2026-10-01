import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

class MetricCard extends StatelessWidget {
  const MetricCard({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
    this.caption,
    this.color,
    this.onTap,
    this.onInfo,
  });

  final String label;
  final String value;
  final IconData icon;
  final String? caption;
  final Color? color;
  final VoidCallback? onTap;
  final VoidCallback? onInfo;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final c = color ?? t.colorScheme.primary;
    return Semantics(
      container: true,
      label: '$label: $value${caption == null ? '' : ', $caption'}',
      button: onTap != null,
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(Gap.lg),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
              Row(children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(color: c.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
                  child: Icon(icon, size: 20, color: c),
                ),
                const Spacer(),
                if (onInfo != null)
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    tooltip: 'How is this calculated?',
                    icon: const Icon(Icons.info_outline_rounded, size: 20),
                    onPressed: onInfo,
                  ),
              ]),
              const SizedBox(height: Gap.md),
              ExcludeSemantics(
                child: Text(label, style: t.textTheme.bodyMedium?.copyWith(color: t.colorScheme.onSurfaceVariant)),
              ),
              const SizedBox(height: 2),
              ExcludeSemantics(
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: AlignmentDirectional.centerStart,
                  child: Text(value, style: t.textTheme.headlineSmall),
                ),
              ),
              if (caption != null) ...[
                const SizedBox(height: 2),
                ExcludeSemantics(
                  child: Text(caption!, maxLines: 2, overflow: TextOverflow.ellipsis,
                      style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.onSurfaceVariant)),
                ),
              ],
            ]),
          ),
        ),
      ),
    );
  }
}
