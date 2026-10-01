import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

/// Camera barcode scanner. Returns the scanned code (or null).
class BarcodeScannerScreen extends StatefulWidget {
  const BarcodeScannerScreen({super.key});
  @override
  State<BarcodeScannerScreen> createState() => _BarcodeScannerScreenState();
}

class _BarcodeScannerScreenState extends State<BarcodeScannerScreen> {
  final _controller = MobileScannerController(detectionSpeed: DetectionSpeed.noDuplicates);
  bool _done = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Scan barcode'), actions: [
        IconButton(tooltip: 'Torch', onPressed: () => _controller.toggleTorch(), icon: const Icon(Icons.flashlight_on_rounded)),
      ]),
      body: Stack(children: [
        MobileScanner(
          controller: _controller,
          errorBuilder: (context, error) => Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text('Camera unavailable. Allow camera access in settings, or type the barcode instead.',
                  textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyLarge),
            ),
          ),
          onDetect: (capture) {
            final code = capture.barcodes.firstOrNull?.rawValue;
            if (code == null || _done) return;
            _done = true;
            Navigator.of(context).pop(code);
          },
        ),
        Center(
          child: Container(
            width: 260,
            height: 160,
            decoration: BoxDecoration(border: Border.all(color: Colors.white, width: 3), borderRadius: BorderRadius.circular(16)),
          ),
        ),
      ]),
    );
  }
}

Future<String?> scanBarcode(BuildContext context) =>
    Navigator.of(context).push<String>(MaterialPageRoute(builder: (_) => const BarcodeScannerScreen()));
