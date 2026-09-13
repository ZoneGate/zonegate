import 'package:flutter/material.dart';

enum StatusTone { positive, negative, pending, neutral }

class StatusBadge extends StatelessWidget {
  final String label;
  final StatusTone tone;

  const StatusBadge({super.key, required this.label, required this.tone});

  Color get _color {
    switch (tone) {
      case StatusTone.positive:
        return const Color(0xFF1AA260);
      case StatusTone.negative:
        return const Color(0xFFE5484D);
      case StatusTone.pending:
        return const Color(0xFFB8860B);
      case StatusTone.neutral:
        return const Color(0xFF6B7A83);
    }
  }

  @override
  Widget build(BuildContext context) {
    final color = _color;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 11,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.3,
        ),
      ),
    );
  }
}
