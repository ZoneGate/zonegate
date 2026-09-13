import 'package:flutter/material.dart';

class AppColors {
  AppColors._();

  static const Color primaryTeal = Color(0xFF0E5C63);
  static const Color background = Colors.white;
  static const Color fieldFill = Color(0xFFEAF1F1);
  static const Color fieldHintText = Color(0xFF8A9A9A);
  static const Color buttonText = Colors.white;

  // Status colors — kept to three meanings: success, danger, pending.
  static const Color statusApproved = Color(0xFF1AA260);
  static const Color statusBlocked = Color(0xFFE5484D);
  static const Color statusPending = Color(0xFFB8860B);

  // Neutral surfaces used on the home screen.
  static const Color cardBorder = Color(0xFFE7EBEC);
  static const Color sectionLabel = Color(0xFF8A9A9A);
  static const Color innerFill = Color(0xFFF4F7F7);
  static const Color iconMuted = Color(0xFF5A6A6A);
}
