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
        child: SizedBox(width: size, height: size, child: CustomPaint(painter: _MarkPainter())),
      );
}

class _MarkPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size s) {
    final r = RRect.fromRectAndRadius(Offset.zero & s, Radius.circular(s.width * 0.28));
    canvas.drawRRect(r, Paint()..shader = const LinearGradient(
      begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [AppColors.brand, AppColors.brandDark],
    ).createShader(Offset.zero & s));
    final w = s.width;
    // Speech bubble outline
    final bubble = Path()
      ..addRRect(RRect.fromRectAndRadius(Rect.fromLTWH(w * .2, w * .22, w * .6, w * .44), Radius.circular(w * .12)))
      ..moveTo(w * .32, w * .64)
      ..lineTo(w * .28, w * .8)
      ..lineTo(w * .46, w * .66);
    canvas.drawPath(bubble, Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = w * .07
      ..strokeJoin = StrokeJoin.round);
    // Rising path inside
    final path = Path()
      ..moveTo(w * .32, w * .52)
      ..lineTo(w * .44, w * .42)
      ..lineTo(w * .53, w * .48)
      ..lineTo(w * .68, w * .34);
    canvas.drawPath(path, Paint()
      ..color = AppColors.accent
      ..style = PaintingStyle.stroke
      ..strokeWidth = w * .075
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class BrandLogo extends StatelessWidget {
  const BrandLogo({super.key, this.size = 36, this.showText = true});
  final double size;
  final bool showText;

  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        BrandMark(size: size),
        if (showText) ...[
          const SizedBox(width: 10),
          Text('BusinessPilot',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.4)),
        ],
      ]);
}
