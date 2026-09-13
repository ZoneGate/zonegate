import 'package:flutter/material.dart';

import '../models/cargo_unit.dart';
import '../models/policy_decision.dart';
import '../services/zonegate_api.dart';
import '../theme/app_colors.dart';
import '../widgets/app_bottom_nav_bar.dart';
import '../widgets/app_top_bar.dart';
import '../widgets/status_badge.dart';
import 'actor_device_view.dart';
import 'cargos_view.dart';
import 'receipt_detail_view.dart';
import 'requests_view.dart';

class HomeView extends StatefulWidget {
  const HomeView({super.key});

  @override
  State<HomeView> createState() => _HomeViewState();
}

class _HomeViewState extends State<HomeView> {
  final ZoneGateApi _api = ZoneGateApi();

  List<DecisionContext> _contexts = const [];
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
      final contexts = await _api.listDecisionContexts(limit: 40);
      if (!mounted) return;

      setState(() {
        _contexts = contexts;
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
    if (tab == AppTab.home) return;

    final builder = tab == AppTab.requests
        ? (BuildContext _) => const RequestsView()
        : (BuildContext _) => const CargosView();

    Navigator.of(context).pushReplacement(MaterialPageRoute(builder: builder));
  }

  Future<void> _openDecision(String decisionId) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ReceiptDetailView(decisionId: decisionId),
      ),
    );
    if (mounted) _load();
  }

  @override
  Widget build(BuildContext context) {
    final awaiting = _contexts
        .where((context) => context.decision.isAwaitingAuthority)
        .toList();
    final recent = _contexts.take(3).toList();
    final cargos = CargoUnit.project(_contexts).take(3).toList();

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
            Expanded(
              child: RefreshIndicator(
                color: AppColors.primaryTeal,
                onRefresh: _load,
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
                  children: [
                    if (_error != null) _ErrorCard(message: _error!),
                    if (_error == null && _loading && _contexts.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 80),
                        child: Center(
                          child: CircularProgressIndicator(
                            color: AppColors.primaryTeal,
                          ),
                        ),
                      ),
                    if (_error == null && (!_loading || _contexts.isNotEmpty)) ...[
                      _AwaitingCard(
                        items: awaiting,
                        onOpen: _openDecision,
                      ),
                      const SizedBox(height: 16),
                      _RecentActivityCard(
                        items: recent,
                        onOpen: _openDecision,
                      ),
                      const SizedBox(height: 16),
                      _CargosCard(units: cargos),
                    ],
                  ],
                ),
              ),
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
}

/// Shared card shell used by every section on the home screen,
/// so spacing/border/radius stays identical across sections.
class _SectionCard extends StatelessWidget {
  final Widget child;
  const _SectionCard({required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.cardBorder),
      ),
      child: child,
    );
  }
}

Widget _sectionHeader(String title, String trailing, {Color? trailingColor}) {
  return Row(
    mainAxisAlignment: MainAxisAlignment.spaceBetween,
    children: [
      Text(
        title,
        style: const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w700,
          color: AppColors.sectionLabel,
          letterSpacing: 0.3,
        ),
      ),
      Text(
        trailing,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w700,
          color: trailingColor ?? AppColors.sectionLabel,
        ),
      ),
    ],
  );
}

class _ErrorCard extends StatelessWidget {
  final String message;
  const _ErrorCard({required this.message});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.statusBlocked.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: AppColors.statusBlocked.withValues(alpha: 0.3),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(
            Icons.cloud_off_rounded,
            size: 18,
            color: AppColors.statusBlocked,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(
                fontSize: 12,
                height: 1.4,
                color: AppColors.statusBlocked,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Awaiting a human authority
// ---------------------------------------------------------------------------

class _AwaitingCard extends StatelessWidget {
  final List<DecisionContext> items;
  final void Function(String decisionId) onOpen;

  const _AwaitingCard({required this.items, required this.onOpen});

  @override
  Widget build(BuildContext context) {
    return _SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionHeader(
            'AWAITING AUTHORITY',
            '${items.length} PENDING',
            trailingColor: items.isEmpty
                ? AppColors.sectionLabel
                : AppColors.statusPending,
          ),
          const SizedBox(height: 12),
          if (items.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Text(
                'Nothing is waiting on a human decision.',
                style: TextStyle(fontSize: 12, color: AppColors.sectionLabel),
              ),
            )
          else
            for (final item in items.take(3)) ...[
              _AwaitingTile(context: item, onOpen: onOpen),
              if (item != items.take(3).last) const SizedBox(height: 10),
            ],
        ],
      ),
    );
  }
}

class _AwaitingTile extends StatelessWidget {
  final DecisionContext context;
  final void Function(String decisionId) onOpen;

  const _AwaitingTile({required this.context, required this.onOpen});

  @override
  Widget build(BuildContext buildContext) {
    final decision = context.decision;
    final transaction = context.transaction;

    return InkWell(
      onTap: () => onOpen(decision.decisionId),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.innerFill,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(
                  Icons.list_alt_rounded,
                  size: 16,
                  color: AppColors.primaryTeal,
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    transaction?.action ?? 'PROTECTED ACTION',
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                    ),
                  ),
                ),
                const StatusBadge(
                  label: 'AWAITING AUTHORITY',
                  tone: StatusTone.pending,
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: _LabelValue(
                    label: 'RESOURCE',
                    value: transaction?.resourceId ?? '—',
                  ),
                ),
                Expanded(
                  child: _LabelValue(
                    label: 'TARGET ZONE',
                    value: transaction?.zone ?? '—',
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            _LabelValue(
              label: 'DECIDED BY',
              value: decision.requiredAuthority ?? 'UNASSIGNED',
            ),
          ],
        ),
      ),
    );
  }
}

class _LabelValue extends StatelessWidget {
  final String label;
  final String value;
  const _LabelValue({required this.label, required this.value});

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

// ---------------------------------------------------------------------------
// Recent activity
// ---------------------------------------------------------------------------

class _RecentActivityCard extends StatelessWidget {
  final List<DecisionContext> items;
  final void Function(String decisionId) onOpen;

  const _RecentActivityCard({required this.items, required this.onOpen});

  @override
  Widget build(BuildContext context) {
    return _SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionHeader('RECENT ACTIVITY', 'Policy engine log'),
          const SizedBox(height: 12),
          if (items.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Text(
                'No decisions recorded yet.',
                style: TextStyle(fontSize: 12, color: AppColors.sectionLabel),
              ),
            )
          else
            for (final item in items) ...[
              InkWell(
                onTap: () => onOpen(item.decision.decisionId),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Row(
                    children: [
                      Icon(
                        _icon(item.decision),
                        size: 18,
                        color: _color(item.decision),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              item.decision.decisionId,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            Text(
                              item.transaction?.resourceId ??
                                  item.decision.transactionId,
                              style: const TextStyle(
                                fontSize: 11,
                                color: AppColors.sectionLabel,
                              ),
                            ),
                          ],
                        ),
                      ),
                      StatusBadge(
                        label: outcomeLabel(item.decision.effectiveOutcome),
                        tone: _tone(item.decision),
                      ),
                    ],
                  ),
                ),
              ),
              if (item != items.last)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 10),
                  child: Divider(height: 1, color: AppColors.cardBorder),
                ),
            ],
        ],
      ),
    );
  }

  StatusTone _tone(PolicyDecision decision) {
    switch (decision.effectiveOutcome) {
      case DecisionOutcome.approve:
        return StatusTone.positive;
      case DecisionOutcome.deny:
        return StatusTone.negative;
      case DecisionOutcome.hold:
        return StatusTone.pending;
    }
  }

  IconData _icon(PolicyDecision decision) {
    switch (decision.effectiveOutcome) {
      case DecisionOutcome.approve:
        return Icons.check_circle_rounded;
      case DecisionOutcome.deny:
        return Icons.block_rounded;
      case DecisionOutcome.hold:
        return Icons.hourglass_bottom_rounded;
    }
  }

  Color _color(PolicyDecision decision) {
    switch (decision.effectiveOutcome) {
      case DecisionOutcome.approve:
        return AppColors.statusApproved;
      case DecisionOutcome.deny:
        return AppColors.statusBlocked;
      case DecisionOutcome.hold:
        return AppColors.statusPending;
    }
  }
}

// ---------------------------------------------------------------------------
// Cargos
// ---------------------------------------------------------------------------

class _CargosCard extends StatelessWidget {
  final List<CargoUnit> units;
  const _CargosCard({required this.units});

  @override
  Widget build(BuildContext context) {
    return _SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionHeader('CARGOS', 'Active Units'),
          const SizedBox(height: 12),
          if (units.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Text(
                'No cargo units have been through the gate yet.',
                style: TextStyle(fontSize: 12, color: AppColors.sectionLabel),
              ),
            )
          else
            for (final unit in units) ...[
              Row(
                children: [
                  Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(
                      color: AppColors.innerFill,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Icon(
                      unit.status == DecisionOutcome.approve
                          ? Icons.local_shipping_rounded
                          : Icons.inventory_2_rounded,
                      size: 17,
                      color: AppColors.primaryTeal,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          unit.resourceId,
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        Text(
                          unit.zone,
                          style: const TextStyle(
                            fontSize: 11,
                            color: AppColors.sectionLabel,
                          ),
                        ),
                      ],
                    ),
                  ),
                  StatusBadge(
                    label: unit.statusLabel,
                    tone: unit.isAwaiting
                        ? StatusTone.pending
                        : unit.status == DecisionOutcome.approve
                            ? StatusTone.positive
                            : unit.status == DecisionOutcome.deny
                                ? StatusTone.negative
                                : StatusTone.pending,
                  ),
                ],
              ),
              if (unit != units.last)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 10),
                  child: Divider(height: 1, color: AppColors.cardBorder),
                ),
            ],
        ],
      ),
    );
  }
}
