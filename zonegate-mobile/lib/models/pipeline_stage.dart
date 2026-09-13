/// The pipeline steps the backend reports while a release is being decided.
///
/// These mirror `POST /v1/authorizations/stream`. They are not an animation:
/// each one arrives when that step actually starts and again when it actually
/// finishes, so a stage that is waiting on the carrier is shown as waiting.
library;

enum PipelineStage { identity, plan, validate, evidence, context, policy }

enum StageStatus { pending, started, done, skipped, failed }

/// Every stage, in the order the pipeline runs them.
const List<PipelineStage> pipelineOrder = [
  PipelineStage.identity,
  PipelineStage.plan,
  PipelineStage.validate,
  PipelineStage.evidence,
  PipelineStage.context,
  PipelineStage.policy,
];

PipelineStage? stageFrom(String raw) {
  switch (raw.toUpperCase()) {
    case 'IDENTITY':
      return PipelineStage.identity;
    case 'PLAN':
      return PipelineStage.plan;
    case 'VALIDATE':
      return PipelineStage.validate;
    case 'EVIDENCE':
      return PipelineStage.evidence;
    case 'CONTEXT':
      return PipelineStage.context;
    case 'POLICY':
      return PipelineStage.policy;
    default:
      // An unknown stage from a newer backend is ignored rather than shown as
      // a broken row; the result event is what the screen actually waits on.
      return null;
  }
}

StageStatus statusFrom(String raw) {
  switch (raw.toUpperCase()) {
    case 'STARTED':
      return StageStatus.started;
    case 'DONE':
      return StageStatus.done;
    case 'SKIPPED':
      return StageStatus.skipped;
    case 'FAILED':
      return StageStatus.failed;
    default:
      return StageStatus.pending;
  }
}

/// What each stage is doing, before the backend has said anything about it.
String stageTitle(PipelineStage stage) {
  switch (stage) {
    case PipelineStage.identity:
      return 'Enrolment and device binding';
    case PipelineStage.plan:
      return 'Agent choosing what to collect';
    case PipelineStage.validate:
      return 'Plan validated against policy';
    case PipelineStage.evidence:
      return 'Carrier network evidence';
    case PipelineStage.context:
      return 'Agent risk assessment';
    case PipelineStage.policy:
      return 'Deterministic policy decision';
  }
}

/// One row on the progress screen.
class StageProgress {
  final PipelineStage stage;
  final StageStatus status;

  /// What the backend said happened, once it has said anything.
  final String detail;

  const StageProgress({
    required this.stage,
    this.status = StageStatus.pending,
    this.detail = '',
  });

  StageProgress copyWith({StageStatus? status, String? detail}) => StageProgress(
        stage: stage,
        status: status ?? this.status,
        // A later event with nothing to add must not erase what an earlier one
        // reported: STARTED carries the plan, DONE carries the outcome.
        detail: (detail == null || detail.isEmpty) ? this.detail : detail,
      );
}

/// A `stage` event off the wire.
class StageEvent {
  final PipelineStage stage;
  final StageStatus status;
  final String label;
  final String detail;

  const StageEvent({
    required this.stage,
    required this.status,
    required this.label,
    required this.detail,
  });

  static StageEvent? fromJson(Map<String, dynamic> json) {
    final stage = stageFrom(json['stage']?.toString() ?? '');
    if (stage == null) return null;

    return StageEvent(
      stage: stage,
      status: statusFrom(json['status']?.toString() ?? ''),
      label: json['label']?.toString() ?? '',
      detail: json['detail']?.toString() ?? '',
    );
  }
}
