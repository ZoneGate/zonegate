import 'package:flutter/material.dart';
import 'status_badge.dart';

class StatusFilterChip extends StatelessWidget {
  final String label;
  final int count;
  final StatusTone tone;
  final bool isActive;
  final VoidCallback onTap;

  const StatusFilterChip({
    super.key,
    required this.label,
    required this.count,
    required this.tone,
    required this.isActive,
    required this.onTap,
  });

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
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: isActive ? color.withValues(alpha: 0.10) : Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: color.withValues(alpha: isActive ? 0.5 : 0.3)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 7,
              height: 7,
              decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            ),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: Colors.black87,
              ),
            ),
            const SizedBox(width: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                '$count',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: color,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
