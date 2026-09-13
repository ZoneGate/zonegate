import 'package:flutter/material.dart';

import '../config/api_config.dart';
import '../models/actor.dart';
import '../services/session.dart';
import '../services/zonegate_api.dart';
import '../theme/app_colors.dart';
import '../util/timestamps.dart';
import '../widgets/app_bottom_nav_bar.dart';
import '../widgets/app_top_bar.dart';
import 'cargos_view.dart';
import 'home_view.dart';
import 'login_view.dart';
import 'requests_view.dart';

/// Shown when the operator taps their profile avatar.
///
/// Displays how their enterprise identity is bound to this enrolled device —
/// the Evidence Gateway checks every carrier call against exactly this binding,
/// so an actor with no active binding can never pass authorization.
class ActorDeviceView extends StatefulWidget {
  const ActorDeviceView({super.key});

  @override
  State<ActorDeviceView> createState() => _ActorDeviceViewState();
}

class _ActorDeviceViewState extends State<ActorDeviceView> {
  final ZoneGateApi _api = ZoneGateApi();

  Enrollment? _enrollment;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _api.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final actorId = Session.actor?.actorId;

    if (actorId == null) {
      setState(() {
        _loading = false;
        _error = 'No actor is signed in on this device.';
      });
      return;
    }

    try {
      final enrollment = await _api.enrollment(actorId);
      if (!mounted) return;

      setState(() {
        _enrollment = enrollment;
        _error = enrollment == null
            ? "'$actorId' is no longer enrolled in ZoneGate."
            : null;
        _loading = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _loading = false;
      });
    }
  }

  void _onTabSelected(AppTab tab) {
    final builder = switch (tab) {
      AppTab.home => (BuildContext _) => const HomeView(),
      AppTab.requests => (BuildContext _) => const RequestsView(),
      AppTab.cargos => (BuildContext _) => const CargosView(),
    };
    Navigator.of(context).pushReplacement(MaterialPageRoute(builder: builder));
  }

  void _signOut() {
    Session.signOut();
    Navigator.of(
      context,
    ).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginView()),
      (route) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: [
            const AppTopBar(),
            const Divider(height: 1, color: AppColors.cardBorder),
            Expanded(
              child: _loading
                  ? const Center(
                      child: CircularProgressIndicator(
                        color: AppColors.primaryTeal,
                      ),
                    )
                  : _body(),
            ),
          ],
        ),
      ),
      bottomNavigationBar: AppBottomNavBar(
        currentTab: AppTab.home,
        onTabSelected: _onTabSelected,
      ),
    );
  }

  Widget _body() {
    final enrollment = _enrollment;

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
      children: [
        const Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.devices_other_rounded,
              size: 14,
              color: AppColors.primaryTeal,
            ),
            SizedBox(width: 6),
            Text(
              'DEVICE BINDING',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: AppColors.primaryTeal,
                letterSpacing: 0.5,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        const Text(
          'Actor-Device Enrollment',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 10),
        const Text(
          'ZoneGate binds your enterprise identity to this enrolled device. '
          'Network evidence is always checked against this binding.',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 13,
            color: AppColors.sectionLabel,
            height: 1.4,
          ),
        ),
        const SizedBox(height: 24),

        if (_error != null)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.statusBlocked.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: AppColors.statusBlocked.withValues(alpha: 0.3),
              ),
            ),
            child: Text(
              _error!,
              style: const TextStyle(
                fontSize: 13,
                height: 1.4,
                color: AppColors.statusBlocked,
              ),
            ),
          ),

        if (enrollment != null) ...[
          _StatusCard(enrollment: enrollment),
          const SizedBox(height: 16),
          _DetailCard(
            icon: Icons.badge_outlined,
            title: 'ACTOR IDENTITY',
            rows: [
              ('Actor ID', enrollment.actor.actorId),
              ('Role', enrollment.actor.roleLabel),
              (
                'Permissions',
                enrollment.actor.permissions.isEmpty
                    ? 'NONE'
                    : enrollment.actor.permissions.join(', ')
              ),
            ],
          ),
          const SizedBox(height: 16),
          _DetailCard(
            icon: Icons.smartphone_rounded,
            title: 'BOUND DEVICE',
            rows: [
              ('Registered number', enrollment.actor.maskedPhone),
              ('Device reference', enrollment.binding.shortReference),
              (
                'Binding active',
                enrollment.binding.isActive ? 'YES' : 'NO'
              ),
              ('Bound at', formatStamp(enrollment.binding.boundAt)),
            ],
          ),
          const SizedBox(height: 16),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.innerFill,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.cardBorder),
            ),
            child: const Text(
              'A carrier call is only made for the number and device bound '
              'here. If the binding fails, the Gateway blocks the request '
              'before it reaches the network.',
              style: TextStyle(
                fontSize: 12,
                height: 1.4,
                color: AppColors.sectionLabel,
              ),
            ),
          ),
        ],

        const SizedBox(height: 24),
        SizedBox(
          width: double.infinity,
          height: 48,
          child: OutlinedButton(
            onPressed: _signOut,
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.statusBlocked,
              side: BorderSide(
                color: AppColors.statusBlocked.withValues(alpha: 0.4),
              ),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: const Text(
              'Sign out',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
            ),
          ),
        ),
        const SizedBox(height: 14),
        Text(
          ApiConfig.baseUrl,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 11, color: AppColors.sectionLabel),
        ),
      ],
    );
  }
}

class _StatusCard extends StatelessWidget {
  final Enrollment enrollment;
  const _StatusCard({required this.enrollment});

  @override
  Widget build(BuildContext context) {
    final active = enrollment.binding.isActive &&
        enrollment.actor.enrollmentStatus.toUpperCase() == 'ACTIVE';

    final accent =
        active ? AppColors.statusApproved : AppColors.statusBlocked;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: accent.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: accent.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: accent.withValues(alpha: 0.14),
            ),
            child: Icon(
              active ? Icons.verified_user_rounded : Icons.gpp_bad_rounded,
              color: accent,
              size: 20,
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'ENROLLMENT STATUS',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: AppColors.sectionLabel,
                    letterSpacing: 0.3,
                  ),
                ),
                const SizedBox(height: 2),
                Row(
                  children: [
                    Container(
                      width: 7,
                      height: 7,
                      margin: const EdgeInsets.only(right: 6),
                      decoration: BoxDecoration(
                        color: accent,
                        shape: BoxShape.circle,
                      ),
                    ),
                    Text(
                      enrollment.actor.enrollmentStatus,
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: accent,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                const Text(
                  'BOUND SINCE',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: AppColors.sectionLabel,
                    letterSpacing: 0.3,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  formatDate(enrollment.binding.boundAt),
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: Colors.black87,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _DetailCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final List<(String, String)> rows;

  const _DetailCard({
    required this.icon,
    required this.title,
    required this.rows,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.innerFill,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.cardBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 15, color: AppColors.primaryTeal),
              const SizedBox(width: 6),
              Text(
                title,
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: AppColors.sectionLabel,
                  letterSpacing: 0.3,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          for (final row in rows)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 5),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      row.$1,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.sectionLabel,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      row.$2,
                      textAlign: TextAlign.right,
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
