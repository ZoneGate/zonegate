import 'policy_decision.dart';

/// One cargo unit, projected from the decisions taken against it.
///
/// The backend has no cargo entity: a container is just the `resource_id` on a
/// transaction. This groups decisions by resource so the operator gets a
/// per-container view, with the newest decision driving its status.
class CargoUnit {
  final String resourceId;
  final String zone;
  final String action;
  final PolicyDecision latest;
  final List<PolicyDecision> history;

  const CargoUnit({
    required this.resourceId,
    required this.zone,
    required this.action,
    required this.latest,
    required this.history,
  });

  DecisionOutcome get status => latest.effectiveOutcome;

  bool get isAwaiting => latest.isAwaitingAuthority;

  String get statusLabel {
    if (isAwaiting) return 'AWAITING AUTHORITY';

    switch (status) {
      case DecisionOutcome.approve:
        return 'CLEARED';
      case DecisionOutcome.deny:
        return 'BLOCKED';
      case DecisionOutcome.hold:
        return 'ON HOLD';
    }
  }

  /// Where the unit sits in the release flow, used to draw the step bar.
  int get stepIndex {
    if (status == DecisionOutcome.approve) return 2;
    if (isAwaiting || status == DecisionOutcome.hold) return 1;
    return 1;
  }

  static List<CargoUnit> project(List<DecisionContext> contexts) {
    final byResource = <String, List<DecisionContext>>{};

    for (final context in contexts) {
      final resource =
          context.transaction?.resourceId ?? context.decision.transactionId;
      byResource.putIfAbsent(resource, () => []).add(context);
    }

    final units = byResource.entries.map((entry) {
      // Contexts arrive newest first, so the head drives the current status.
      final newest = entry.value.first;

      return CargoUnit(
        resourceId: entry.key,
        zone: newest.transaction?.zone ?? 'UNKNOWN ZONE',
        action: newest.transaction?.action ?? 'UNKNOWN ACTION',
        latest: newest.decision,
        history: entry.value.map((context) => context.decision).toList(),
      );
    }).toList();

    units.sort((a, b) => b.latest.decidedAt.compareTo(a.latest.decidedAt));
    return units;
  }
}
