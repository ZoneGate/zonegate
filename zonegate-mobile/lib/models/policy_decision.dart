/// Domain models mirroring the ZoneGate backend payloads.
///
/// Field names follow the API's snake_case exactly so the mapping stays
/// obvious when reading a response next to the model.
library;

enum DecisionOutcome { approve, hold, deny }

DecisionOutcome _outcomeFrom(String raw) {
  switch (raw.toUpperCase()) {
    case 'APPROVE':
      return DecisionOutcome.approve;
    case 'DENY':
      return DecisionOutcome.deny;
    default:
      return DecisionOutcome.hold;
  }
}

String outcomeLabel(DecisionOutcome outcome) {
  switch (outcome) {
    case DecisionOutcome.approve:
      return 'APPROVE';
    case DecisionOutcome.deny:
      return 'DENY';
    case DecisionOutcome.hold:
      return 'HOLD';
  }
}

class ContextEvaluation {
  final List<String> riskFactors;
  final DecisionOutcome recommendedControl;
  final String rationale;

  const ContextEvaluation({
    required this.riskFactors,
    required this.recommendedControl,
    required this.rationale,
  });

  factory ContextEvaluation.fromJson(Map<String, dynamic> json) {
    return ContextEvaluation(
      riskFactors: (json['risk_factors'] as List<dynamic>? ?? [])
          .map((factor) => factor.toString())
          .toList(),
      recommendedControl:
          _outcomeFrom(json['recommended_control']?.toString() ?? 'HOLD'),
      rationale: json['rationale']?.toString() ?? '',
    );
  }
}

class EvidenceSummary {
  final bool? numberVerified;
  final bool? locationVerified;
  final bool? recentSimSwap;
  final bool? recentDeviceSwap;
  final bool? reachable;

  const EvidenceSummary({
    this.numberVerified,
    this.locationVerified,
    this.recentSimSwap,
    this.recentDeviceSwap,
    this.reachable,
  });

  factory EvidenceSummary.fromJson(Map<String, dynamic> json) {
    return EvidenceSummary(
      numberVerified: json['number_verified'] as bool?,
      locationVerified: json['location_verified'] as bool?,
      recentSimSwap: json['recent_sim_swap'] as bool?,
      recentDeviceSwap: json['recent_device_swap'] as bool?,
      reachable: json['reachable'] as bool?,
    );
  }
}

class HoldResolution {
  final DecisionOutcome outcome;
  final String resolvedBy;
  final String authorityRole;
  final String note;
  final DateTime resolvedAt;

  const HoldResolution({
    required this.outcome,
    required this.resolvedBy,
    required this.authorityRole,
    required this.note,
    required this.resolvedAt,
  });

  factory HoldResolution.fromJson(Map<String, dynamic> json) {
    return HoldResolution(
      outcome: _outcomeFrom(json['outcome']?.toString() ?? 'HOLD'),
      resolvedBy: json['resolved_by']?.toString() ?? '',
      authorityRole: json['authority_role']?.toString() ?? '',
      note: json['note']?.toString() ?? '',
      resolvedAt:
          DateTime.tryParse(json['resolved_at']?.toString() ?? '')?.toUtc() ??
              DateTime.now().toUtc(),
    );
  }
}

class PolicyDecision {
  final String decisionId;
  final String transactionId;
  final DecisionOutcome decision;
  final List<String> reasons;
  final String? requiredAuthority;
  final ContextEvaluation? contextEvaluation;
  final EvidenceSummary? evidenceSummary;
  final DateTime decidedAt;
  final HoldResolution? resolution;

  const PolicyDecision({
    required this.decisionId,
    required this.transactionId,
    required this.decision,
    required this.reasons,
    required this.decidedAt,
    this.requiredAuthority,
    this.contextEvaluation,
    this.evidenceSummary,
    this.resolution,
  });

  /// A HOLD that no human has decided yet.
  bool get isAwaitingAuthority =>
      decision == DecisionOutcome.hold && resolution == null;

  /// What actually happened: the human verdict when there is one, otherwise
  /// the policy engine's own outcome.
  DecisionOutcome get effectiveOutcome => resolution?.outcome ?? decision;

  factory PolicyDecision.fromJson(Map<String, dynamic> json) {
    final evaluation = json['context_evaluation'];
    final evidence = json['evidence_summary'];
    final resolution = json['resolution'];

    return PolicyDecision(
      decisionId: json['decision_id']?.toString() ?? '',
      transactionId: json['transaction_id']?.toString() ?? '',
      decision: _outcomeFrom(json['decision']?.toString() ?? 'HOLD'),
      reasons: (json['reasons'] as List<dynamic>? ?? [])
          .map((reason) => reason.toString())
          .toList(),
      requiredAuthority: json['required_authority']?.toString(),
      contextEvaluation: evaluation is Map<String, dynamic>
          ? ContextEvaluation.fromJson(evaluation)
          : null,
      evidenceSummary: evidence is Map<String, dynamic>
          ? EvidenceSummary.fromJson(evidence)
          : null,
      decidedAt:
          DateTime.tryParse(json['decided_at']?.toString() ?? '')?.toUtc() ??
              DateTime.now().toUtc(),
      resolution: resolution is Map<String, dynamic>
          ? HoldResolution.fromJson(resolution)
          : null,
    );
  }
}

class TransactionRequest {
  final String transactionId;
  final String actorId;
  final String action;
  final String resourceId;
  final String zone;
  final DateTime timestamp;

  /// Declared value. Recorded for the audit trail; it decides nothing.
  final String value;

  /// Cargo category. A category the policy marks as restricted is escalated
  /// to its named authority instead of releasing on the engine's own decision.
  final String category;

  const TransactionRequest({
    required this.transactionId,
    required this.actorId,
    required this.action,
    required this.resourceId,
    required this.zone,
    required this.timestamp,
    required this.value,
    this.category = 'GENERAL',
  });

  factory TransactionRequest.fromJson(Map<String, dynamic> json) {
    return TransactionRequest(
      transactionId: json['transaction_id']?.toString() ?? '',
      actorId: json['actor_id']?.toString() ?? '',
      action: json['action']?.toString() ?? '',
      resourceId: json['resource_id']?.toString() ?? '',
      zone: json['zone']?.toString() ?? '',
      timestamp:
          DateTime.tryParse(json['timestamp']?.toString() ?? '')?.toUtc() ??
              DateTime.now().toUtc(),
      value: json['value']?.toString() ?? '0',
      category: json['category']?.toString() ?? 'GENERAL',
    );
  }

  Map<String, dynamic> toJson() => {
        'transaction_id': transactionId,
        'actor_id': actorId,
        'action': action,
        'resource_id': resourceId,
        'zone': zone,
        'timestamp': timestamp.toUtc().toIso8601String(),
        'value': value,
        'category': category,
      };
}

class Receipt {
  final String receiptId;
  final String decisionId;
  final String transactionId;
  final DecisionOutcome decision;
  final DateTime issuedAt;
  final String? token;

  const Receipt({
    required this.receiptId,
    required this.decisionId,
    required this.transactionId,
    required this.decision,
    required this.issuedAt,
    this.token,
  });

  factory Receipt.fromJson(Map<String, dynamic> json) {
    return Receipt(
      receiptId: json['receipt_id']?.toString() ?? '',
      decisionId: json['decision_id']?.toString() ?? '',
      transactionId: json['transaction_id']?.toString() ?? '',
      decision: _outcomeFrom(json['decision']?.toString() ?? 'HOLD'),
      issuedAt:
          DateTime.tryParse(json['issued_at']?.toString() ?? '')?.toUtc() ??
              DateTime.now().toUtc(),
      token: json['token']?.toString(),
    );
  }
}

class DecisionContext {
  final PolicyDecision decision;
  final TransactionRequest? transaction;
  final EvidenceSummary? evidence;
  final List<String> collectedEvidence;
  final Receipt? receipt;

  const DecisionContext({
    required this.decision,
    required this.collectedEvidence,
    this.transaction,
    this.evidence,
    this.receipt,
  });

  factory DecisionContext.fromJson(Map<String, dynamic> json) {
    final transaction = json['transaction'];
    final evidence = json['evidence'];
    final plan = json['evidence_plan'];
    final receipt = json['receipt'];

    return DecisionContext(
      decision: PolicyDecision.fromJson(json['decision'] as Map<String, dynamic>),
      transaction: transaction is Map<String, dynamic>
          ? TransactionRequest.fromJson(transaction)
          : null,
      evidence: evidence is Map<String, dynamic>
          ? EvidenceSummary.fromJson(evidence)
          : null,
      collectedEvidence: plan is Map<String, dynamic>
          ? (plan['combined'] as List<dynamic>? ?? [])
              .map((kind) => kind.toString())
              .toList()
          : const [],
      receipt: receipt is Map<String, dynamic> ? Receipt.fromJson(receipt) : null,
    );
  }
}

class AuthorizationResult {
  final PolicyDecision decision;
  final Receipt receipt;

  const AuthorizationResult({required this.decision, required this.receipt});

  factory AuthorizationResult.fromJson(Map<String, dynamic> json) {
    return AuthorizationResult(
      decision: PolicyDecision.fromJson(json['decision'] as Map<String, dynamic>),
      receipt: Receipt.fromJson(json['receipt'] as Map<String, dynamic>),
    );
  }
}
