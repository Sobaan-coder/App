import 'dart:typed_data';

import 'package:share_plus/share_plus.dart';

/// Uses the native share sheet (Android) / Web Share API or download (web).
class ShareService {
  const ShareService._();

  static Future<void> shareText(String text, {String? subject}) =>
      SharePlus.instance.share(ShareParams(text: text, subject: subject));

  static Future<void> shareFile(Uint8List bytes, String filename, String mimeType, {String? text}) =>
      SharePlus.instance.share(ShareParams(
        files: [XFile.fromData(bytes, name: filename, mimeType: mimeType)],
        fileNameOverrides: [filename],
        text: text,
      ));
}
