import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';

/// BusinessPilot mark: a rounded tile with a "speech + upward path" glyph —
/// a conversation that moves the business forward.
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 40});
  final double size;

  @override
  Widget build(BuildContext context) => Semantics(
    label: 'BusinessPilot',
    image: true,
    child: SizedBox(
      width: size,
      height: size,
      child: CustomPaint(painter: _MarkPainter()),
    ),
  );
}

class _MarkPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size s) {
    final r = RRect.fromRectAndRadius(Offset.zero & s, Radius.circular(s.width * 0.28));
    canvas.drawRRect(
      r,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.brand, AppColors.brandDark],
        ).createShader(Offset.zero & s),
    );
    final u = s.width / 100;
    // Speech bubble (same geometry as branding/logo.svg): outline with a solid tail.
    canvas.drawPath(Path.combine(PathOperation.difference,
        Path.combine(PathOperation.union,
            Path()..addRRect(RRect.fromLTRBR(20 * u, 22 * u, 80 * u, 66 * u, Radius.circular(12 * u))),
            Path()..addPolygon([Offset(30 * u, 62 * u), Offset(27 * u, 82 * u), Offset(50 * u, 62 * u)], true)),
        Path()..addRRect(RRect.fromLTRBR(27 * u, 29 * u, 73 * u, 59 * u, Radius.circular(6 * u)))), Paint()..color = Colors.white);
    // Rising path: the business moving forward.
    final path = Path()
      ..moveTo(33 * u, 51 * u)
      ..lineTo(44 * u, 42 * u)
      ..lineTo(53 * u, 48 * u)
      ..lineTo(67 * u, 36 * u);
    canvas.drawPath(
      path,
      Paint()
        ..color = AppColors.accent
        ..style = PaintingStyle.stroke
        ..strokeWidth = 7 * u
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class BrandLogo extends StatelessWidget {
  const BrandLogo({super.key, this.size = 36, this.showText = true});
  final double size;
  final bool showText;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      BrandMark(size: size),
      if (showText) ...[
        const SizedBox(width: 10),
        Flexible(
          child: Text(
            'BusinessPilot',
            overflow: TextOverflow.fade,
            softWrap: false,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.4),
          ),
        ),
      ],
    ],
  );
}
