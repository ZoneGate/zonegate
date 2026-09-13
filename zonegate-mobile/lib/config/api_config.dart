import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;

/// Where the ZoneGate authorization API lives.
///
/// `127.0.0.1` means "this device", so it resolves differently everywhere the
/// app runs. Rather than hard-coding one address, the base URL is supplied at
/// build time and only falls back to a per-platform default:
///
///   flutter run --dart-define=API_URL=http://192.168.1.105:8000
///
/// | Running on          | Address to use              |
/// |---------------------|-----------------------------|
/// | Android emulator    | http://10.0.2.2:8000        |
/// | iOS simulator       | http://127.0.0.1:8000       |
/// | Physical phone      | `http://<dev machine LAN IP>:8000` |
/// | Flutter web         | http://127.0.0.1:8000       |
///
/// The emulator reaches the host machine through 10.0.2.2; a physical phone
/// needs the machine's LAN address and has to be on the same Wi-Fi.
class ApiConfig {
  ApiConfig._();

  static const String _override = String.fromEnvironment('API_URL');

  static String get baseUrl {
    if (_override.isNotEmpty) return _override;

    if (kIsWeb) return 'http://127.0.0.1:8000';

    // The Android emulator maps the host loopback to 10.0.2.2.
    if (Platform.isAndroid) return 'http://10.0.2.2:8000';

    return 'http://127.0.0.1:8000';
  }

  /// True when the address was supplied at build time rather than guessed.
  static bool get isExplicit => _override.isNotEmpty;

  static const Duration timeout = Duration(seconds: 15);

  /// Only the wait for the streamed response to *open*, not for the pipeline
  /// to finish. A cold local model can take longer than a plain request, and
  /// the point of the stream is that the operator watches it work.
  static const Duration streamTimeout = Duration(seconds: 30);
}
