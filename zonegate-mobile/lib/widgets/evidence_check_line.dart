import 'package:flutter/material.dart';

import '../models/policy_decision.dart';
import '../theme/app_colors.dart';

/// One evidence check, as a sentence somebody can read without a legend.
///
/// TRUE and FALSE were exact but not readable: whether `recent_sim_swap: true`
/// is good news depends on knowing that a swap is the bad outcome. A sentence
/// and a tick say the same thing without the reader having to invert anything
/// in their head.
class EvidenceCheck {
  final String sentence;

  /// True passed, false failed, null was never collected. Not collected is
  /// deliberately neither: evidence that was not gathered did not pass.
  final bool? passed;

  const EvidenceCheck({required this.sentence, required this.passed});
}

/// The five carrier checks, phrased for the state each one is actually in.
///
/// Built from what the Gateway collected rather than a fixed list, so a check
/// the planner never requested reads as not checked instead of silently
/// reading as a pass.
///
/// `planned` is the evidence plan's combined list, when it is known. With it,
/// an empty reading is told apart: a check that was on the plan and got no
/// answer says the carrier did not answer, and number verification missing
/// from the plan says the carrier cannot attest it -- the validator only drops
/// it for that reason. Without a plan nothing is guessed.
List<EvidenceCheck> evidenceChecksFrom(
  EvidenceSummary? evidence, {
  List<String> planned = const [],
}) {
  EvidenceCheck line(
    bool? value, {
    required String kind,
    required String label,
    required String passed,
    required String failed,
    required String absent,
    String? unattestable,
    bool invert = false,
  }) {
    if (value == null) {
      final String sentence;
      if (planned.contains(kind)) {
        sentence = '$label was requested, but the carrier did not answer.';
      } else if (planned.isNotEmpty && unattestable != null) {
        sentence = unattestable;
      } else {
        sentence = absent;
      }
      return EvidenceCheck(sentence: sentence, passed: null);
    }

    final good = invert ? !value : value;
    return EvidenceCheck(sentence: good ? passed : failed, passed: good);
  }

  return [
    line(
      evidence?.numberVerified,
      kind: 'NUMBER_VERIFICATION',
      label: 'Number verification',
      unattestable:
          'The carrier cannot confirm your number over the network, so your '
          'enrolment record stands in for it.',
      passed: 'The carrier confirmed your registered number on this device.',
      failed: 'The carrier could not confirm your registered number.',
      absent: 'Your registered number was not checked for this request.',
    ),
    line(
      evidence?.locationVerified,
      kind: 'LOCATION_VERIFICATION',
      label: 'Location verification',
      passed: 'The network placed your device inside the authorized zone.',
      failed: 'The network placed your device outside the authorized zone.',
      absent: 'Your location was not checked for this request.',
    ),
    line(
      evidence?.recentSimSwap,
      kind: 'SIM_SWAP',
      label: 'The SIM swap check',
      invert: true,
      passed: 'No SIM swap has been reported on your line recently.',
      failed: 'A recent SIM swap was reported on your line.',
      absent: 'SIM continuity was not checked for this request.',
    ),
    line(
      evidence?.recentDeviceSwap,
      kind: 'DEVICE_SWAP',
      label: 'The device swap check',
      invert: true,
      passed: 'Your line is still on the hardware it was enrolled with.',
      failed: 'Your line has recently moved to different hardware.',
      absent: 'Device continuity was not checked for this request.',
    ),
    line(
      evidence?.reachable,
      kind: 'REACHABILITY',
      label: 'The reachability check',
      passed: 'Your device is attached to the carrier network right now.',
      failed: 'Your device is not currently attached to the network.',
      absent: 'Network reachability was not checked for this request.',
    ),
  ];
}

/// A tick, a cross, or a dash, and the sentence that goes with it.
class EvidenceCheckLine extends StatelessWidget {
  final EvidenceCheck check;

  const EvidenceCheckLine({super.key, required this.check});

  @override
  Widget build(BuildContext context) {
    final passed = check.passed;

    final (IconData icon, Color colour) = switch (passed) {
      true => (Icons.check_circle, AppColors.statusApproved),
      false => (Icons.cancel, AppColors.statusBlocked),
      // Not collected is not a pass and not a failure. A dash says so without
      // borrowing the colour of either.
      null => (Icons.remove_circle_outline, AppColors.sectionLabel),
    };

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 13),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: colour),
          const SizedBox(width: 11),
          Expanded(
            child: Text(
              check.sentence,
              style: TextStyle(
                fontSize: 13.5,
                height: 1.35,
                color: passed == null ? AppColors.sectionLabel : Colors.black87,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
