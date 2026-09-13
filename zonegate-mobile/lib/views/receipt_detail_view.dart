import 'package:flutter/material.dart';

import '../models/policy_decision.dart';
import '../services/zonegate_api.dart';
import '../theme/app_colors.dart';
import '../util/timestamps.dart';
import '../widgets/status_badge.dart';
import '../models/evidence_label.dart';

/// The full record for one authorization, loaded from the backend.
///
/// Everything here comes from `/v1/authorizations/{id}/context`: the
/// transaction, the network evidence the gateway collected, the agent's
/// advisory assessment, the policy engine's binding outcome, and — when a HOLD
/// was handed to a person — their final verdict.
class ReceiptDetailView extends StatefulWidget {
  final String decisionId;

  const ReceiptDetailView({super.key, required this.decisionId});

  @override
  State<ReceiptDetailView> createState() => _ReceiptDetailViewState();
}

class _ReceiptDetailViewState extends State<ReceiptDetailView> {
  final ZoneGateApi _api = ZoneGateApi();

  DecisionContext? _context;
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
    try {
      final loaded = await _api.decisionContext(widget.decisionId);
      if (!mounted) return;
      setState(() {
        _context = loaded;
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        elevation: 0,
        foregroundColor: const Color(0xFF12242A),
        title: const Text(
          'Authorization Record',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
        ),
      ),
      body: SafeArea(
        child: _loading
            ? const Center(
                child: CircularProgressIndicator(color: AppColors.primaryTeal),
              )
            : _error != null
            ? Padding(
                padding: const EdgeInsets.all(20),
                child: Text(
                  _error!,
                  style: const TextStyle(
                    fontSize: 13,
                    height: 1.4,
                    color: AppColors.statusBlocked,
                  ),
                ),
              )
            : _body(_context!),
      ),
    );
  }

  Widget _body(DecisionContext data) {
    final decision = data.decision;
    final transaction = data.transaction;
    final evidence = data.evidence;
    final resolution = decision.resolution;
    final receipt = data.receipt;

    final tone = switch (decision.effectiveOutcome) {
      DecisionOutcome.approve => StatusTone.positive,
      DecisionOutcome.deny => StatusTone.negative,
      DecisionOutcome.hold => StatusTone.pending,
    };

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            StatusBadge(
              label: outcomeLabel(decision.effectiveOutcome),
              tone: tone,
            ),
            if (decision.isAwaitingAuthority)
              const StatusBadge(
                label: 'AWAITING AUTHORITY',
                tone: StatusTone.pending,
              ),
            if (resolution != null)
              const StatusBadge(
                label: 'HUMAN DECIDED',
                tone: StatusTone.neutral,
              ),
          ],
        ),
        const SizedBox(height: 14),
        Text(
          transaction == null
              ? decision.decisionId
              : '${transaction.action} · ${transaction.resourceId}',
          style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 4),
        Text(
          receipt == null
              ? decision.decisionId
              : '${receipt.receiptId} · ${decision.decisionId}',
          style: const TextStyle(fontSize: 12, color: AppColors.sectionLabel),
        ),
        const SizedBox(height: 20),

        _Card(
          title: 'POLICY OUTCOME',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final reason in decision.reasons)
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Text(
                    reason,
                    style: const TextStyle(fontSize: 13, height: 1.4),
                  ),
                ),
              const SizedBox(height: 4),
              _Row(
                label: 'Decision source',
                value: resolution == null
                    ? 'DETERMINISTIC POLICY'
                    : 'AUTHORIZED HUMAN',
              ),
              if (decision.requiredAuthority != null)
                _Row(
                  label: 'Required authority',
                  value: decision.requiredAuthority!,
                ),
              _Row(label: 'Decided at', value: formatStamp(decision.decidedAt)),
            ],
          ),
        ),

        if (transaction != null)
          _Card(
            title: 'REQUESTED ACTION',
            child: Column(
              children: [
                _Row(label: 'Actor', value: transaction.actorId),
                _Row(label: 'Resource', value: transaction.resourceId),
                _Row(label: 'Zone', value: transaction.zone),
                _Row(label: 'Value', value: transaction.value),
                _Row(
                  label: 'Requested',
                  value: formatStamp(transaction.timestamp),
                ),
              ],
            ),
          ),

        if (evidence != null)
          _Card(
            title: 'NETWORK EVIDENCE',
            child: Column(
              children: [
                _EvidenceRow(
                  label: 'Number verification',
                  kind: 'NUMBER_VERIFICATION',
                  planned: data.collectedEvidence,
                  state: evidence.numberVerified,
                ),
                _EvidenceRow(
                  label: 'Location verification',
                  kind: 'LOCATION_VERIFICATION',
                  planned: data.collectedEvidence,
                  state: evidence.locationVerified,
                ),
                _EvidenceRow(
                  label: 'SIM swap check',
                  kind: 'SIM_SWAP',
                  planned: data.collectedEvidence,
                  state: evidence.recentSimSwap,
                ),
                _EvidenceRow(
                  label: 'Device swap check',
                  kind: 'DEVICE_SWAP',
                  planned: data.collectedEvidence,
                  state: evidence.recentDeviceSwap,
                ),
                _EvidenceRow(
                  label: 'Reachability',
                  kind: 'REACHABILITY',
                  planned: data.collectedEvidence,
                  state: evidence.reachable,
                ),
                if (data.collectedEvidence.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Text(
                    'Collected: ${data.collectedEvidence.join(', ')}',
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppColors.sectionLabel,
                    ),
                  ),
                ],
              ],
            ),
          ),

        _Card(
          title: 'AGENT ASSESSMENT (ADVISORY)',
          child: decision.contextEvaluation == null
              ? const Text(
                  'No agent assessment was recorded. Evidence planning fell '
                  'back to the mandatory baseline and the decision was made on '
                  'network facts alone.',
                  style: TextStyle(fontSize: 13, height: 1.4),
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        for (final factor
                            in decision.contextEvaluation!.riskFactors)
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: AppColors.innerFill,
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              factor,
                              style: const TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Text(
                      decision.contextEvaluation!.rationale,
                      style: const TextStyle(
                        fontSize: 13,
                        height: 1.4,
                        fontStyle: FontStyle.italic,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      'Recommended: '
                      '${outcomeLabel(decision.contextEvaluation!.recommendedControl)}'
                      ' — advisory only, never binding',
                      style: const TextStyle(
                        fontSize: 11,
                        color: AppColors.sectionLabel,
                      ),
                    ),
                  ],
                ),
        ),

        if (resolution != null)
          _Card(
            title: 'HUMAN RESOLUTION',
            child: Column(
              children: [
                _Row(
                  label: 'Final outcome',
                  value: outcomeLabel(resolution.outcome),
                ),
                _Row(label: 'Decided by', value: resolution.resolvedBy),
                _Row(label: 'Authority', value: resolution.authorityRole),
                _Row(
                  label: 'Decided at',
                  value: formatStamp(resolution.resolvedAt),
                ),
                if (resolution.note.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      resolution.note,
                      style: const TextStyle(
                        fontSize: 12,
                        height: 1.4,
                        color: AppColors.sectionLabel,
                      ),
                    ),
                  ),
              ],
            ),
          ),

        if (decision.isAwaitingAuthority)
          Container(
            margin: const EdgeInsets.only(bottom: 14),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.statusPending.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: AppColors.statusPending.withValues(alpha: 0.3),
              ),
            ),
            child: Text(
              'Waiting on ${decision.requiredAuthority ?? 'a designated authority'}. '
              'This decision is resolved from the operations console, not from '
              'the field app.',
              style: const TextStyle(
                fontSize: 12,
                height: 1.4,
                color: AppColors.statusPending,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),

        if (receipt?.token != null)
          _Card(
            title: 'SCOPED AUTHORIZATION TOKEN',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  receipt!.token!,
                  style: const TextStyle(fontSize: 11, height: 1.5),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Bound to this actor, action, resource and zone.',
                  style: TextStyle(fontSize: 11, color: AppColors.sectionLabel),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _Card extends StatelessWidget {
  final String title;
  final Widget child;

  const _Card({required this.title, required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.background,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.cardBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.4,
              color: AppColors.sectionLabel,
            ),
          ),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  final String label;
  final String value;

  const _Row({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Text(
              label,
              style: const TextStyle(
                fontSize: 12,
                color: AppColors.sectionLabel,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}

/// One network evidence check: a tick, a cross or a dash, and what the
/// carrier reported in a short line underneath.
class _EvidenceRow extends StatelessWidget {
  final String label;
  final String kind;
  final List<String> planned;
  final bool? state;

  const _EvidenceRow({
    required this.label,
    required this.kind,
    required this.planned,
    required this.state,
  });

  @override
  Widget build(BuildContext context) {
    final badge = evidenceBadge(kind, state, planned);

    final (IconData icon, Color colour) = switch (badge.passed) {
      true => (Icons.check_circle, AppColors.statusApproved),
      false => (Icons.cancel, AppColors.statusBlocked),
      null => (Icons.remove_circle_outline, const Color(0xFF6B7A83)),
    };

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: colour),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: const TextStyle(fontSize: 13)),
                const SizedBox(height: 2),
                Text(
                  badge.detail,
                  style: const TextStyle(
                    fontSize: 11.5,
                    height: 1.3,
                    color: AppColors.sectionLabel,
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
