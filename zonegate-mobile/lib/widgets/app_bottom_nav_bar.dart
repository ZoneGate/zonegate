import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

enum AppTab { requests, home, cargos }

class AppBottomNavBar extends StatelessWidget {
  final AppTab? currentTab;
  final ValueChanged<AppTab> onTabSelected;

  const AppBottomNavBar({
    super.key,
    this.currentTab,
    required this.onTabSelected,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: AppColors.cardBorder)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          _NavItem(
            icon: Icons.checklist_rounded,
            label: 'Requests',
            isActive: currentTab == AppTab.requests,
            onTap: () => onTabSelected(AppTab.requests),
          ),
          _NavItem(
            icon: Icons.home_rounded,
            label: 'Home',
            isActive: currentTab == AppTab.home,
            onTap: () => onTabSelected(AppTab.home),
          ),
          _NavItem(
            icon: Icons.inventory_2_rounded,
            label: 'Cargos',
            isActive: currentTab == AppTab.cargos,
            onTap: () => onTabSelected(AppTab.cargos),
          ),
        ],
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool isActive;
  final VoidCallback onTap;

  const _NavItem({
    required this.icon,
    required this.label,
    required this.isActive,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final color = isActive ? AppColors.primaryTeal : AppColors.iconMuted;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 6),
              decoration: BoxDecoration(
                color: isActive
                    ? AppColors.primaryTeal.withValues(alpha: 0.12)
                    : Colors.transparent,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, color: color, size: 22),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: TextStyle(
                color: color,
                fontSize: 11,
                fontWeight: isActive ? FontWeight.w600 : FontWeight.w400,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
