import 'package:flutter/material.dart';

import '../models/cargo_unit.dart';
import '../models/policy_decision.dart';
import '../services/zonegate_api.dart';
import '../theme/app_colors.dart';
import '../widgets/app_bottom_nav_bar.dart';
import '../widgets/app_top_bar.dart';
import '../widgets/status_badge.dart';
import 'actor_device_view.dart';
import 'home_view.dart';
import 'receipt_detail_view.dart';
import 'release_request_view.dart';
import 'requests_view.dart';

/// Cargo units seen by the gate, projected from the decisions taken against
/// each resource. The backend has no cargo entity — a container is the
/// `resource_id` on a transaction — so this view groups by that.
class CargosView extends StatefulWidget {
  const CargosView({super.key});

  @override
  State<CargosView> createState() => _CargosViewState();
}

class _CargosViewState extends State<CargosView> {
  final ZoneGateApi _api = ZoneGateApi();

  List<CargoUnit> _units = const [];
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
    setState(() => _loading = true);

    try {
      final contexts = await _api.listDecisionContexts(limit: 60);
      if (!mounted) return;

      setState(() {
        _units = CargoUnit.project(contexts);
        _error = null;
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
    if (tab == AppTab.cargos) return;

    final builder = tab == AppTab.home
        ? (BuildContext _) => const HomeView()
        : (BuildContext _) => const RequestsView();

    Navigator.of(context).pushReplacement(MaterialPageRoute(builder: builder));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: [
            AppTopBar(
              onAvatarTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const ActorDeviceView()),
                );
              },
            ),
            const Divider(height: 1, color: AppColors.cardBorder),
            Expanded(
              child: RefreshIndicator(
                color: AppColors.primaryTeal,
                onRefresh: _load,
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(20, 20, 20, 96),
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Cargo Units',
                                style: TextStyle(
                                  fontSize: 24,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              SizedBox(height: 4),
                              Text(
                                'Grouped by the resource each decision targeted',
                                style: TextStyle(
                                  fontSize: 13,
                                  color: AppColors.sectionLabel,
                                ),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          onPressed: _loading ? null : _load,
                          icon: const Icon(Icons.refresh_rounded),
                          color: AppColors.primaryTeal,
                          tooltip: 'Refresh',
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    if (_error != null)
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: AppColors.statusBlocked.withValues(alpha: 0.06),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color:
                                AppColors.statusBlocked.withValues(alpha: 0.3),
                          ),
                        ),
                        child: Text(
                          _error!,
                          style: const TextStyle(
                            fontSize: 12,
                            height: 1.4,
                            color: AppColors.statusBlocked,
                          ),
                        ),
                      )
                    else if (_loading && _units.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 60),
                        child: Center(
                          child: CircularProgressIndicator(
                            color: AppColors.primaryTeal,
                          ),
                        ),
                      )
                    else if (_units.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 60),
                        child: Center(
                          child: Text(
                            'No cargo units have been through the gate yet.',
                            style: TextStyle(
                              fontSize: 13,
                              color: AppColors.sectionLabel,
                            ),
                          ),
                        ),
                      )
                    else
                      for (final unit in _units) ...[
                        _CargoCard(
                          unit: unit,
                          onOpen: () async {
                            await Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => ReceiptDetailView(
                                  decisionId: unit.latest.decisionId,
                                ),
                              ),
                            );
                            if (mounted) _load();
                          },
                        ),
                        const SizedBox(height: 12),
                      ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () async {
          await Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const ReleaseRequestView()),
          );
          if (mounted) _load();
        },
        backgroundColor: AppColors.primaryTeal,
        foregroundColor: AppColors.buttonText,
        icon: const Icon(Icons.lock_open_rounded, size: 18),
        label: const Text(
          'Request release',
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      bottomNavigationBar: AppBottomNavBar(
        currentTab: AppTab.cargos,
        onTabSelected: _onTabSelected,
      ),
    );
  }
}

class _CargoCard extends StatelessWidget {
  final CargoUnit unit;
  final VoidCallback onOpen;

  const _CargoCard({required this.unit, required this.onOpen});

  StatusTone get _tone {
    if (unit.isAwaiting) return StatusTone.pending;

    switch (unit.status) {
      case DecisionOutcome.approve:
        return StatusTone.positive;
      case DecisionOutcome.deny:
        return StatusTone.negative;
      case DecisionOutcome.hold:
        return StatusTone.pending;
    }
  }

  Color get _accent {
    switch (_tone) {
      case StatusTone.positive:
        return AppColors.statusApproved;
      case StatusTone.negative:
        return AppColors.statusBlocked;
      case StatusTone.pending:
        return AppColors.statusPending;
      case StatusTone.neutral:
        return const Color(0xFF6B7A83);
    }
  }

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onOpen,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.cardBorder),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: _accent.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(
                    unit.status == DecisionOutcome.approve
                        ? Icons.local_shipping_rounded
                        : Icons.inventory_2_rounded,
                    size: 20,
                    color: _accent,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        unit.resourceId,
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        unit.action,
                        style: const TextStyle(
                          fontSize: 11,
                          color: AppColors.sectionLabel,
                        ),
                      ),
                    ],
                  ),
                ),
                StatusBadge(label: unit.statusLabel, tone: _tone),
              ],
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: _Field(label: 'TARGET ZONE', value: unit.zone),
                ),
                Expanded(
                  child: _Field(
                    label: 'DECISIONS',
                    value: '${unit.history.length}',
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            _StepBar(unit: unit),
            const SizedBox(height: 12),
            Text(
              unit.latest.reasons.isEmpty ? '' : unit.latest.reasons.first,
              style: const TextStyle(
                fontSize: 11,
                height: 1.4,
                color: AppColors.sectionLabel,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Field extends StatelessWidget {
  final String label;
  final String value;
  const _Field({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(fontSize: 10, color: AppColors.sectionLabel),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
        ),
      ],
    );
  }
}

/// Where the unit stands in the release flow: evidence collected, decision
/// taken, released. A blocked unit stops at the decision step.
class _StepBar extends StatelessWidget {
  final CargoUnit unit;
  const _StepBar({required this.unit});

  @override
  Widget build(BuildContext context) {
    final labels = ['1. Evidence', '2. Decision', '3. Released'];
    final reached = unit.stepIndex;
    final blocked = unit.status == DecisionOutcome.deny;

    return Row(
      children: [
        for (var i = 0; i < labels.length; i++) ...[
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  height: 4,
                  decoration: BoxDecoration(
                    color: i <= reached
                        ? (blocked && i == reached
                            ? AppColors.statusBlocked
                            : AppColors.primaryTeal)
                        : AppColors.cardBorder,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  labels[i],
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: i == reached ? FontWeight.w800 : FontWeight.w500,
                    color: i <= reached
                        ? AppColors.iconMuted
                        : AppColors.sectionLabel,
                  ),
                ),
              ],
            ),
          ),
          if (i != labels.length - 1) const SizedBox(width: 6),
        ],
      ],
    );
  }
}
