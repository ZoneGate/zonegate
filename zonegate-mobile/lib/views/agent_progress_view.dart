import 'dart:async';

import 'package:flutter/material.dart';

import '../models/pipeline_stage.dart';
import '../models/policy_decision.dart';
import '../services/zonegate_api.dart';
import '../theme/app_colors.dart';
import 'approval_result_view.dart';
import 'receipt_detail_view.dart';
import 'security_alert_view.dart';

/// What the pipeline is doing, while it is doing it.
///
/// The operator used to watch a spinner for the whole run and then land on a
/// result. Six distinct checks happen in that time, against three different
/// systems, and which one takes the longest — or refuses — is the most useful
/// thing on the screen.
///
/// Nothing here is on a timer. Each row changes when the backend says that
/// step started or finished, so a stage sitting at "in progress" is a stage
/// genuinely still waiting on a carrier.
class AgentProgressView extends StatefulWidget {
  final TransactionRequest transaction;

  const AgentProgressView({super.key, required this.transaction});

  @override
  State<AgentProgressView> createState() => _AgentProgressViewState();
}

class _AgentProgressViewState extends State<AgentProgressView> {
  final ZoneGateApi _api = ZoneGateApi();

  late List<StageProgress> _stages = [
    for (final stage in pipelineOrder) StageProgress(stage: stage),
  ];

  StreamSubscription<Object>? _subscription;
  String? _error;

  @override
  void initState() {
    super.initState();
    _run();
  }

  @override
  void dispose() {
    _subscription?.cancel();
    _api.dispose();
    super.dispose();
  }

  void _run() {
    _subscription = _api
        .streamAuthorization(widget.transaction)
        .listen(
          (event) {
            if (!mounted) return;

            if (event is StageEvent) {
              setState(() {
                _stages = [
                  for (final row in _stages)
                    if (row.stage == event.stage)
                      row.copyWith(status: event.status, detail: event.detail)
                    else
                      row,
                ];
              });
              return;
            }

            if (event is AuthorizationResult) {
              // The pipeline answered. Leave the finished stages on screen just
              // long enough to be read, then hand over to the result screen.
              Future<void>.delayed(const Duration(milliseconds: 550), () {
                if (mounted) unawaited(_goToResult(event.decision));
              });
            }
          },
          onError: (Object error) {
            if (!mounted) return;
            setState(() {
              _error = error is ApiException
                  ? error.message
                  : 'The authorization pipeline could not be reached.';
            });
          },
        );
  }

  Future<void> _goToResult(PolicyDecision decision) async {
    // The result screens say why a check is empty, which needs the evidence
    // plan; the decision itself does not carry it. Without it the screens fall
    // back to wording that guesses nothing.
    var planned = const <String>[];
    if (decision.decision != DecisionOutcome.hold) {
      try {
        planned = (await _api.decisionContext(
          decision.decisionId,
        )).collectedEvidence;
      } on Object {
        planned = const [];
      }
      if (!mounted) return;
    }

    final Widget destination = switch (decision.decision) {
      DecisionOutcome.approve => ApprovalResultView.fromDecision(
        decision,
        planned: planned,
      ),
      DecisionOutcome.deny => SecurityAlertView.fromDecision(
        decision,
        zone: widget.transaction.zone,
        planned: planned,
      ),
      DecisionOutcome.hold => ReceiptDetailView(
        decisionId: decision.decisionId,
      ),
    };

    Navigator.of(
      context,
    ).pushReplacement(MaterialPageRoute(builder: (_) => destination));
  }

  @override
  Widget build(BuildContext context) {
    final finished = _stages
        .where((row) => row.status != StageStatus.pending)
        .length;

    return PopScope(
      // Backing out mid-pipeline would leave the operator with no idea whether
      // the release went through. The decision is recorded either way.
      canPop: _error != null,
      child: Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(
          backgroundColor: AppColors.background,
          elevation: 0,
          automaticallyImplyLeading: _error != null,
          foregroundColor: const Color(0xFF12242A),
          title: const Text(
            'Evaluating Request',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
          ),
        ),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
            children: [
              Text(
                widget.transaction.resourceId,
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '${widget.transaction.category} · ${widget.transaction.zone}',
                style: const TextStyle(
                  fontSize: 12,
                  color: AppColors.sectionLabel,
                ),
              ),
              const SizedBox(height: 18),

              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: finished / pipelineOrder.length,
                  minHeight: 5,
                  backgroundColor: AppColors.innerFill,
                  valueColor: const AlwaysStoppedAnimation(
                    AppColors.primaryTeal,
                  ),
                ),
              ),
              const SizedBox(height: 18),

              for (final row in _stages) _StageRow(progress: row),

              if (_error != null) ...[
                const SizedBox(height: 18),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppColors.statusBlocked.withValues(alpha: 0.06),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: AppColors.statusBlocked.withValues(alpha: 0.3),
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
                ),
                const SizedBox(height: 14),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: OutlinedButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('Back'),
                  ),
                ),
              ],

              const SizedBox(height: 20),
              const Text(
                'Every step above runs on the backend. The agent advises; only '
                'the deterministic policy engine decides.',
                style: TextStyle(
                  fontSize: 11,
                  height: 1.5,
                  color: AppColors.sectionLabel,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StageRow extends StatelessWidget {
  final StageProgress progress;

  const _StageRow({required this.progress});

  @override
  Widget build(BuildContext context) {
    final status = progress.status;

    final Color colour = switch (status) {
      StageStatus.done => AppColors.statusApproved,
      StageStatus.failed => AppColors.statusBlocked,
      StageStatus.started => AppColors.primaryTeal,
      StageStatus.skipped => AppColors.sectionLabel,
      StageStatus.pending => const Color(0xFFCBD5D5),
    };

    final Widget marker = switch (status) {
      StageStatus.started => const SizedBox(
        width: 18,
        height: 18,
        child: CircularProgressIndicator(
          strokeWidth: 2,
          color: AppColors.primaryTeal,
        ),
      ),
      StageStatus.done => Icon(Icons.check_circle, size: 20, color: colour),
      StageStatus.failed => Icon(Icons.cancel, size: 20, color: colour),
      StageStatus.skipped => Icon(
        Icons.remove_circle_outline,
        size: 20,
        color: colour,
      ),
      StageStatus.pending => Icon(
        Icons.circle_outlined,
        size: 20,
        color: colour,
      ),
    };

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 9),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 24, child: Center(child: marker)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  stageTitle(progress.stage),
                  style: TextStyle(
                    fontSize: 14,
                    height: 1.3,
                    fontWeight: status == StageStatus.pending
                        ? FontWeight.w400
                        : FontWeight.w600,
                    color: status == StageStatus.pending
                        ? AppColors.sectionLabel
                        : Colors.black87,
                  ),
                ),
                if (progress.detail.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(
                    progress.detail,
                    style: TextStyle(
                      fontSize: 11.5,
                      height: 1.4,
                      color: status == StageStatus.failed
                          ? AppColors.statusBlocked
                          : AppColors.sectionLabel,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
