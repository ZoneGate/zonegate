// The sentences the result screens show for each carrier check, including
// what an empty reading says once the evidence plan is known.

import 'package:flutter_test/flutter_test.dart';
import 'package:is_takip_uygulamasi/models/policy_decision.dart';
import 'package:is_takip_uygulamasi/widgets/evidence_check_line.dart';

EvidenceSummary summary({
  bool? number,
  bool? location = true,
  bool? sim,
  bool? device,
  bool? reachable,
}) {
  return EvidenceSummary.fromJson({
    'number_verified': number,
    'location_verified': location,
    'recent_sim_swap': sim,
    'recent_device_swap': device,
    'reachable': reachable,
  });
}

void main() {
  test('number verification dropped from the plan reads as unattestable', () {
    final checks = evidenceChecksFrom(
      summary(),
      planned: const ['LOCATION_VERIFICATION'],
    );

    expect(checks.first.sentence, contains('cannot confirm your number'));
    expect(checks.first.passed, isNull);
  });

  test('an optional check nobody asked for still reads as not checked', () {
    final checks = evidenceChecksFrom(
      summary(),
      planned: const ['LOCATION_VERIFICATION'],
    );

    expect(
      checks[2].sentence,
      'SIM continuity was not checked for this request.',
    );
  });

  test('a planned check with no answer says the carrier did not answer', () {
    final checks = evidenceChecksFrom(
      summary(),
      planned: const ['LOCATION_VERIFICATION', 'REACHABILITY'],
    );

    expect(checks.last.sentence, contains('carrier did not answer'));
  });

  test('without a plan nothing is guessed', () {
    final checks = evidenceChecksFrom(summary());

    expect(
      checks.first.sentence,
      'Your registered number was not checked for this request.',
    );
  });

  test('an answered check reads as the carrier gave it', () {
    final checks = evidenceChecksFrom(
      summary(sim: false),
      planned: const ['LOCATION_VERIFICATION', 'SIM_SWAP'],
    );

    expect(checks[1].passed, isTrue);
    expect(checks[2].passed, isTrue);
  });
}
