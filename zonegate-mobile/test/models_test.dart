// Unit tests for the projections the screens depend on.
//
// These cover the logic that decides what an operator is shown: whether a
// decision still stands, whether it is waiting on a person, and how a cargo
// unit's status is derived from the decisions taken against it.

import 'package:flutter_test/flutter_test.dart';
import 'package:is_takip_uygulamasi/models/actor.dart';
import 'package:is_takip_uygulamasi/models/cargo_unit.dart';
import 'package:is_takip_uygulamasi/models/evidence_label.dart';
import 'package:is_takip_uygulamasi/models/policy_decision.dart';

Map<String, dynamic> decisionJson({
  required String id,
  required String outcome,
  Map<String, dynamic>? resolution,
  String decidedAt = '2026-09-10T09:00:00Z',
}) {
  return {
    'decision_id': id,
    'transaction_id': 'tx_$id',
    'decision': outcome,
    'reasons': ['test reason'],
    'required_authority': outcome == 'HOLD' ? 'ROLE_CARGO_SUPERVISOR' : null,
    'context_evaluation': null,
    'evidence_summary': null,
    'decided_at': decidedAt,
    'resolution': resolution,
  };
}

Map<String, dynamic> contextJson({
  required String id,
  required String outcome,
  required String resource,
  String zone = 'PORT_GATE_17',
  Map<String, dynamic>? resolution,
  String decidedAt = '2026-09-10T09:00:00Z',
}) {
  return {
    'decision': decisionJson(
      id: id,
      outcome: outcome,
      resolution: resolution,
      decidedAt: decidedAt,
    ),
    'transaction': {
      'transaction_id': 'tx_$id',
      'actor_id': 'usr_cargo_operator_01',
      'action': 'RELEASE_CARGO',
      'resource_id': resource,
      'zone': zone,
      'timestamp': decidedAt,
      'value': '25000.00',
      'metadata': <String, String>{},
    },
    'evidence': null,
    'evidence_plan': null,
    'receipt': null,
  };
}

void main() {
  group('PolicyDecision', () {
    test('a human resolution supersedes the HOLD it resolved', () {
      final decision = PolicyDecision.fromJson(
        decisionJson(
          id: 'dec_1',
          outcome: 'HOLD',
          resolution: {
            'outcome': 'APPROVE',
            'resolved_by': 'usr_cargo_supervisor_02',
            'authority_role': 'ROLE_CARGO_SUPERVISOR',
            'note': 'Verified against the manifest',
            'resolved_at': '2026-09-10T10:00:00Z',
          },
        ),
      );

      expect(decision.decision, DecisionOutcome.hold);
      expect(decision.effectiveOutcome, DecisionOutcome.approve);
      expect(decision.isAwaitingAuthority, isFalse);
    });

    test('an unresolved HOLD is still awaiting a person', () {
      final decision = PolicyDecision.fromJson(
        decisionJson(id: 'dec_2', outcome: 'HOLD'),
      );

      expect(decision.isAwaitingAuthority, isTrue);
      expect(decision.requiredAuthority, 'ROLE_CARGO_SUPERVISOR');
    });

    test('a DENY is never awaiting anyone', () {
      final decision = PolicyDecision.fromJson(
        decisionJson(id: 'dec_3', outcome: 'DENY'),
      );

      expect(decision.isAwaitingAuthority, isFalse);
      expect(decision.effectiveOutcome, DecisionOutcome.deny);
    });
  });

  group('CargoUnit.project', () {
    test('groups decisions by resource and takes the newest as current', () {
      final units = CargoUnit.project([
        // Contexts arrive newest first, as the API returns them.
        DecisionContext.fromJson(
          contextJson(
            id: 'dec_new',
            outcome: 'APPROVE',
            resource: 'CT-100',
            decidedAt: '2026-09-10T12:00:00Z',
          ),
        ),
        DecisionContext.fromJson(
          contextJson(
            id: 'dec_old',
            outcome: 'DENY',
            resource: 'CT-100',
            decidedAt: '2026-09-10T08:00:00Z',
          ),
        ),
      ]);

      expect(units, hasLength(1));
      expect(units.first.resourceId, 'CT-100');
      expect(units.first.history, hasLength(2));
      expect(units.first.status, DecisionOutcome.approve);
      expect(units.first.statusLabel, 'CLEARED');
    });

    test('separates distinct resources and orders them newest first', () {
      final units = CargoUnit.project([
        DecisionContext.fromJson(
          contextJson(
            id: 'dec_a',
            outcome: 'HOLD',
            resource: 'CT-200',
            decidedAt: '2026-09-10T12:00:00Z',
          ),
        ),
        DecisionContext.fromJson(
          contextJson(
            id: 'dec_b',
            outcome: 'APPROVE',
            resource: 'CT-300',
            decidedAt: '2026-09-10T09:00:00Z',
          ),
        ),
      ]);

      expect(units.map((unit) => unit.resourceId), ['CT-200', 'CT-300']);
      expect(units.first.statusLabel, 'AWAITING AUTHORITY');
      expect(units.first.stepIndex, 1);
      expect(units.last.stepIndex, 2);
    });
  });

  group('Actor', () {
    Actor withRole(String role) => Actor.fromJson({
      'actor_id': 'usr_any',
      'role': role,
      'permissions': <String>[],
      'registered_phone_number': '+14155550199',
      'registered_device_id': 'dev_1',
      'enrollment_status': 'ACTIVE',
    });

    test('a cargo operator is field personnel, with or without the prefix', () {
      expect(withRole('CARGO_OPERATOR').isFieldPersonnel, isTrue);
      expect(withRole('ROLE_CARGO_OPERATOR').isFieldPersonnel, isTrue);
      expect(withRole(' role_cargo_operator ').isFieldPersonnel, isTrue);
    });

    test('supervisors and officers belong on the console, not the app', () {
      expect(withRole('ROLE_CARGO_SUPERVISOR').isFieldPersonnel, isFalse);
      expect(withRole('ROLE_SECURITY_OFFICER').isFieldPersonnel, isFalse);
    });

    test('masks the middle of the registered number', () {
      final actor = Actor.fromJson({
        'actor_id': 'usr_cargo_operator_01',
        'role': 'ROLE_CARGO_OPERATOR',
        'permissions': ['cargo:release'],
        'registered_phone_number': '+14155550199',
        'registered_device_id': 'dev_imei_99887766',
        'enrollment_status': 'ACTIVE',
      });

      expect(actor.maskedPhone, '+1415•••0199');
      expect(actor.roleLabel, 'ROLE CARGO OPERATOR');
    });

    test('leaves a number too short to mask untouched', () {
      final actor = Actor.fromJson({
        'actor_id': 'usr_short',
        'role': 'ROLE_GATE_CLERK',
        'permissions': <String>[],
        'registered_phone_number': '+1415',
        'registered_device_id': 'dev_1',
        'enrollment_status': 'ACTIVE',
      });

      expect(actor.maskedPhone, '+1415');
    });
  });

  group('evidenceBadge', () {
    const planned = ['LOCATION_VERIFICATION', 'SIM_SWAP'];

    test("ticks a check that came out in the operator's favour", () {
      final badge = evidenceBadge('LOCATION_VERIFICATION', true, planned);
      expect(badge.passed, isTrue);
      expect(badge.detail, 'The network placed the device inside the zone.');
    });

    test('reads a swap check the right way round', () {
      expect(evidenceBadge('SIM_SWAP', false, planned).passed, isTrue);
      final swapped = evidenceBadge('SIM_SWAP', true, planned);
      expect(swapped.passed, isFalse);
      expect(swapped.detail, 'The SIM on this line was swapped recently.');
    });

    test('an empty reading is neither ticked nor crossed, and says why', () {
      expect(
        evidenceBadge('SIM_SWAP', null, planned).detail,
        'Requested, but the carrier did not answer.',
      );
      expect(
        evidenceBadge('REACHABILITY', null, planned).detail,
        'Not requested for this decision.',
      );
      final number = evidenceBadge('NUMBER_VERIFICATION', null, planned);
      expect(number.passed, isNull);
      expect(number.detail, 'The carrier cannot attest this over the network.');
    });

    test('does not guess without a plan', () {
      expect(
        evidenceBadge('NUMBER_VERIFICATION', null, const []).detail,
        'No result was recorded for this check.',
      );
    });
  });

  group('DeviceBinding', () {
    test('shortens the device id to its trailing reference', () {
      final binding = DeviceBinding.fromJson({
        'actor_id': 'usr_cargo_operator_01',
        'phone_number': '+14155550199',
        'device_id': 'dev_imei_99887766',
        'bound_at': '2026-09-09T23:11:38Z',
        'is_active': true,
      });

      expect(binding.shortReference, '99887766');
      expect(binding.isActive, isTrue);
    });
  });
}
