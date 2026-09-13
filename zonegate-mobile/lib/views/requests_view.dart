import 'package:flutter/material.dart';

import '../config/api_config.dart';
import '../models/policy_decision.dart';
import '../services/zonegate_api.dart';
import '../theme/app_colors.dart';
import '../widgets/app_bottom_nav_bar.dart';
import '../widgets/app_top_bar.dart';
import '../widgets/status_badge.dart';
import '../widgets/status_filter_chip.dart';
import 'actor_device_view.dart';
import 'cargos_view.dart';
import 'receipt_detail_view.dart';
import 'home_view.dart';

StatusTone toneFor(PolicyDecision decision) {
  switch (decision.effectiveOutcome) {
    case DecisionOutcome.approve:
      return StatusTone.positive;
    case DecisionOutcome.deny:
      return StatusTone.negative;
    case DecisionOutcome.hold:
      return StatusTone.pending;
  }
}

String formatUtcTime(DateTime value) {
  final utc = value.toUtc();
  final hour = utc.hour.toString().padLeft(2, '0');
  final minute = utc.minute.toString().padLeft(2, '0');
  return '$hour:$minute UTC';
}

String relativeFrom(DateTime value) {
  final diff = DateTime.now().toUtc().difference(value.toUtc());

  if (diff.inSeconds < 60) return 'just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
  if (diff.inHours < 24) return '${diff.inHours}h ago';
  return '${diff.inDays}d ago';
}

class RequestsView extends StatefulWidget {
  const RequestsView({super.key});

  @override
  State<RequestsView> createState() => _RequestsViewState();
}

class _RequestsViewState extends State<RequestsView> {
  final ZoneGateApi _api = ZoneGateApi();

  // Contexts rather than bare decisions: a row has to say which cargo it was
  // about, and only the transaction carries the resource.
  List<DecisionContext> _entries = const [];
  final Set<StatusTone> _activeFilters = {};

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
    setState(() {
      _loading = true;
    });

    try {
      final entries = await _api.listDecisionContexts(limit: 100);
      if (!mounted) return;

      setState(() {
        _entries = entries;
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

  void _toggleFilter(StatusTone tone) {
    setState(() {
      if (_activeFilters.contains(tone)) {
        _activeFilters.remove(tone);
      } else {
        _activeFilters.add(tone);
      }
    });
  }

  List<DecisionContext> get _visible {
    if (_activeFilters.isEmpty) return _entries;
    return _entries
        .where((entry) => _activeFilters.contains(toneFor(entry.decision)))
        .toList();
  }

  int _countFor(StatusTone tone) =>
      _entries.where((entry) => toneFor(entry.decision) == tone).length;

  void _onTabSelected(AppTab tab) {
    if (tab == AppTab.requests) return;
    if (tab == AppTab.home) {
      Navigator.of(
        context,
      ).pushReplacement(MaterialPageRoute(builder: (_) => const HomeView()));
      return;
    }
    if (tab == AppTab.cargos) {
      Navigator.of(
        context,
      ).pushReplacement(MaterialPageRoute(builder: (_) => const CargosView()));
    }
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
                  padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Authorization Requests',
                                style: TextStyle(
                                  fontSize: 24,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              SizedBox(height: 4),
                              Text(
                                'Live decisions from the policy engine',
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
                    if (_error != null) _ErrorPanel(message: _error!),
                    if (_error == null) ...[
                      Wrap(
                        spacing: 10,
                        runSpacing: 10,
                        children: [
                          StatusFilterChip(
                            label: 'APPROVED',
                            count: _countFor(StatusTone.positive),
                            tone: StatusTone.positive,
                            isActive:
                                _activeFilters.contains(StatusTone.positive),
                            onTap: () => _toggleFilter(StatusTone.positive),
                          ),
                          StatusFilterChip(
                            label: 'BLOCKED',
                            count: _countFor(StatusTone.negative),
                            tone: StatusTone.negative,
                            isActive:
                                _activeFilters.contains(StatusTone.negative),
                            onTap: () => _toggleFilter(StatusTone.negative),
                          ),
                          StatusFilterChip(
                            label: 'HOLD',
                            count: _countFor(StatusTone.pending),
                            tone: StatusTone.pending,
                            isActive:
                                _activeFilters.contains(StatusTone.pending),
                            onTap: () => _toggleFilter(StatusTone.pending),
                          ),
                        ],
                      ),
                      const SizedBox(height: 22),
                      const Row(
                        children: [
                          Expanded(
                            child: Text(
                              'RESOURCE & DECISION ID',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                color: AppColors.sectionLabel,
                                letterSpacing: 0.3,
                              ),
                            ),
                          ),
                          Text(
                            'DECIDED',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              color: AppColors.sectionLabel,
                              letterSpacing: 0.3,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      if (_loading && _entries.isEmpty)
                        const Padding(
                          padding: EdgeInsets.symmetric(vertical: 48),
                          child: Center(
                            child: CircularProgressIndicator(
                              color: AppColors.primaryTeal,
                            ),
                          ),
                        )
                      else if (_visible.isEmpty)
                        const Padding(
                          padding: EdgeInsets.symmetric(vertical: 48),
                          child: Center(
                            child: Text(
                              'No authorization records yet.',
                              style: TextStyle(
                                fontSize: 13,
                                color: AppColors.sectionLabel,
                              ),
                            ),
                          ),
                        )
                      else
                        for (final entry in _visible) ...[
                          _DecisionTile(
                            entry: entry,
                            onTap: () async {
                              await Navigator.of(context).push(
                                MaterialPageRoute(
                                  builder: (_) => ReceiptDetailView(
                                    decisionId: entry.decision.decisionId,
                                  ),
                                ),
                              );
                              if (mounted) _load();
                            },
                          ),
                          if (entry != _visible.last)
                            const Divider(
                              height: 1,
                              color: AppColors.cardBorder,
                            ),
                        ],
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: AppBottomNavBar(
        currentTab: AppTab.requests,
        onTabSelected: _onTabSelected,
      ),
    );
  }
}

class _ErrorPanel extends StatelessWidget {
  final String message;
  const _ErrorPanel({required this.message});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.statusBlocked.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: AppColors.statusBlocked.withValues(alpha: 0.3),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.cloud_off_rounded,
                size: 18,
                color: AppColors.statusBlocked,
              ),
              const SizedBox(width: 8),
              const Text(
                'Authorization API unavailable',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: AppColors.statusBlocked,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            message,
            style: const TextStyle(
              fontSize: 12,
              color: AppColors.statusBlocked,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            'Endpoint: ${ApiConfig.baseUrl}',
            style: const TextStyle(
              fontSize: 11,
              color: AppColors.sectionLabel,
            ),
          ),
          if (!ApiConfig.isExplicit)
            const Padding(
              padding: EdgeInsets.only(top: 4),
              child: Text(
                'Address was inferred. Pass --dart-define=API_URL=... to override.',
                style: TextStyle(fontSize: 11, color: AppColors.sectionLabel),
              ),
            ),
        ],
      ),
    );
  }
}

class _DecisionTile extends StatelessWidget {
  final DecisionContext entry;
  final VoidCallback onTap;

  const _DecisionTile({required this.entry, required this.onTap});

  PolicyDecision get decision => entry.decision;

  /// The container the decision released or held. A decision whose
  /// transaction is no longer on record falls back to its transaction id.
  String get _title {
    final resource = entry.transaction?.resourceId ?? '';
    return resource.isNotEmpty ? resource : decision.transactionId;
  }

  IconData get _icon {
    switch (toneFor(decision)) {
      case StatusTone.positive:
        return Icons.check_rounded;
      case StatusTone.negative:
        return Icons.block_rounded;
      case StatusTone.pending:
        return Icons.hourglass_bottom_rounded;
      case StatusTone.neutral:
        return Icons.help_outline_rounded;
    }
  }

  Color get _color {
    switch (toneFor(decision)) {
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
    final color = _color;

    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(_icon, size: 18, color: color),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          _title,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      if (decision.isAwaitingAuthority) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 6,
                            vertical: 2,
                          ),
                          decoration: BoxDecoration(
                            color: AppColors.statusPending
                                .withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: const Text(
                            'AWAITING',
                            style: TextStyle(
                              fontSize: 9,
                              fontWeight: FontWeight.w800,
                              color: AppColors.statusPending,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${formatUtcTime(decision.decidedAt)} · ${decision.decisionId}',
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.sectionLabel,
                    ),
                  ),
                ],
              ),
            ),
            Text(
              relativeFrom(decision.decidedAt),
              style: const TextStyle(
                fontSize: 12,
                color: AppColors.sectionLabel,
              ),
            ),
            const SizedBox(width: 4),
            const Icon(
              Icons.chevron_right_rounded,
              size: 18,
              color: AppColors.sectionLabel,
            ),
          ],
        ),
      ),
    );
  }
}
