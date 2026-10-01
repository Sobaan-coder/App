import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

Future<T?> showAppBottomSheet<T>(BuildContext context, {required String title, required Widget child}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    constraints: const BoxConstraints(maxWidth: 640),
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(Gap.radiusLg))),
    builder: (ctx) => Padding(
      padding: EdgeInsets.only(left: Gap.xl, right: Gap.xl, bottom: MediaQuery.viewInsetsOf(ctx).bottom + Gap.xl),
      child: SingleChildScrollView(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
          Text(title, style: Theme.of(ctx).textTheme.titleLarge),
          const SizedBox(height: Gap.lg),
          child,
        ]),
      ),
    ),
  );
}
