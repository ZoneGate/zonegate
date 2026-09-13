// Tests for the mobile API client.
//
// The field app is the surface an operator uses at a gate, so the failure
// paths matter as much as the happy ones: an unreachable backend has to say
// so, and a 404 on an actor has to mean "not enrolled", not "crashed".

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:is_takip_uygulamasi/models/policy_decision.dart';
import 'package:is_takip_uygulamasi/services/zonegate_api.dart';

/// Answers requests from a canned map of path -> (status, body).
class FakeClient extends http.BaseClient {
  FakeClient(this.responder);

  final ({int status, String body}) Function(http.BaseRequest request) responder;
  final List<http.BaseRequest> requests = [];

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    requests.add(request);
    final result = responder(request);

    return http.StreamedResponse(
      Stream.value(utf8.encode(result.body)),
      result.status,
    );
  }
}

/// A client whose every request fails the way an unreachable host does.
class UnreachableClient extends http.BaseClient {
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) {
    throw const SocketExceptionStub();
  }
}

class SocketExceptionStub implements Exception {
  const SocketExceptionStub();
}

String decisionBody({
  String id = 'dec_1',
  String outcome = 'APPROVE',
  Map<String, dynamic>? resolution,
}) {
  return jsonEncode({
    'decision_id': id,
    'transaction_id': 'tx_$id',
    'decision': outcome,
    'reasons': ['test reason'],
    'required_authority': outcome == 'HOLD' ? 'ROLE_CARGO_SUPERVISOR' : null,
    'context_evaluation': null,
    'evidence_summary': null,
    'decided_at': '2026-09-10T09:00:00Z',
    'resolution': resolution,
  });
}

void main() {
  group('error handling', () {
    test('an unreachable backend names the address it tried', () async {
      final api = ZoneGateApi(
        client: UnreachableClient(),
        baseUrl: 'http://10.0.2.2:8000',
      );

      await expectLater(
        api.health(),
        throwsA(
          isA<ApiException>()
              .having((e) => e.isUnreachable, 'isUnreachable', isTrue)
              .having((e) => e.message, 'message', contains('10.0.2.2:8000')),
        ),
      );
    });

    test('a backend error message is surfaced verbatim', () async {
      final api = ZoneGateApi(
        client: FakeClient(
          (_) => (
            status: 404,
            body: jsonEncode({'detail': "Actor 'usr_ghost' is not enrolled"}),
          ),
        ),
        baseUrl: 'http://test',
      );

      await expectLater(
        api.listDecisions(),
        throwsA(
          isA<ApiException>()
              .having((e) => e.statusCode, 'statusCode', 404)
              .having((e) => e.message, 'message', contains('usr_ghost')),
        ),
      );
    });

    test('a non-JSON error body falls back to the status line', () async {
      final api = ZoneGateApi(
        client: FakeClient((_) => (status: 502, body: '<html>bad gateway</html>')),
        baseUrl: 'http://test',
      );

      await expectLater(
        api.listDecisions(),
        throwsA(
          isA<ApiException>().having((e) => e.message, 'message', contains('502')),
        ),
      );
    });
  });

  group('enrollment lookup', () {
    test('a 404 means not enrolled, not an error to show the operator', () async {
      final api = ZoneGateApi(
        client: FakeClient(
          (_) => (status: 404, body: jsonEncode({'detail': 'not enrolled'})),
        ),
        baseUrl: 'http://test',
      );

      expect(await api.enrollment('usr_ghost'), isNull);
    });

    test('an enrolled actor comes back with their binding', () async {
      final api = ZoneGateApi(
        client: FakeClient(
          (_) => (
            status: 200,
            body: jsonEncode({
              'actor': {
                'actor_id': 'usr_cargo_operator_01',
                'role': 'ROLE_CARGO_OPERATOR',
                'permissions': ['cargo:release'],
                'registered_phone_number': '+14155550199',
                'registered_device_id': 'dev_imei_99887766',
                'enrollment_status': 'ACTIVE',
              },
              'binding': {
                'actor_id': 'usr_cargo_operator_01',
                'phone_number': '+14155550199',
                'device_id': 'dev_imei_99887766',
                'bound_at': '2026-09-09T23:11:38Z',
                'is_active': true,
              },
            }),
          ),
        ),
        baseUrl: 'http://test',
      );

      final enrollment = await api.enrollment('usr_cargo_operator_01');

      expect(enrollment, isNotNull);
      expect(enrollment!.actor.maskedPhone, '+1415•••0199');
      expect(enrollment.binding.isActive, isTrue);
    });

    test('a server error is still raised, not swallowed as "not enrolled"',
        () async {
      final api = ZoneGateApi(
        client: FakeClient((_) => (status: 500, body: '{}')),
        baseUrl: 'http://test',
      );

      await expectLater(api.enrollment('usr_1'), throwsA(isA<ApiException>()));
    });

    test('the actor id is escaped into the path', () async {
      final fake = FakeClient(
        (_) => (status: 404, body: jsonEncode({'detail': 'x'})),
      );
      final api = ZoneGateApi(client: fake, baseUrl: 'http://test');

      await api.enrollment('usr with space');

      expect(fake.requests.first.url.path, contains('usr%20with%20space'));
    });
  });

  group('decision listing', () {
    test('sends no filter parameters when none were asked for', () async {
      final fake = FakeClient((_) => (status: 200, body: '[]'));
      final api = ZoneGateApi(client: fake, baseUrl: 'http://test');

      await api.listDecisions();

      expect(fake.requests.first.url.queryParameters.containsKey('decision'),
          isFalse);
      expect(
          fake.requests.first.url.queryParameters.containsKey('pending'), isFalse);
    });

    test('passes outcome and pending through', () async {
      final fake = FakeClient((_) => (status: 200, body: '[]'));
      final api = ZoneGateApi(client: fake, baseUrl: 'http://test');

      await api.listDecisions(
        outcome: DecisionOutcome.hold,
        pendingOnly: true,
        limit: 20,
      );

      final query = fake.requests.first.url.queryParameters;
      expect(query['decision'], 'HOLD');
      expect(query['pending'], 'true');
      expect(query['limit'], '20');
    });

    test('parses a list of decisions', () async {
      final api = ZoneGateApi(
        client: FakeClient(
          (_) => (status: 200, body: '[${decisionBody(outcome: 'HOLD')}]'),
        ),
        baseUrl: 'http://test',
      );

      final decisions = await api.listDecisions();

      expect(decisions, hasLength(1));
      expect(decisions.first.decision, DecisionOutcome.hold);
      expect(decisions.first.isAwaitingAuthority, isTrue);
    });

    test('reads the bulk contexts endpoint', () async {
      final fake = FakeClient((_) => (status: 200, body: '[]'));
      final api = ZoneGateApi(client: fake, baseUrl: 'http://test');

      await api.listDecisionContexts(limit: 40);

      expect(fake.requests.first.url.path, '/v1/authorizations/contexts');
      expect(fake.requests.first.url.queryParameters['limit'], '40');
    });
  });

  group('authorization request', () {
    test('posts the transaction and parses the decision back', () async {
      final fake = FakeClient(
        (_) => (
          status: 201,
          body: jsonEncode({
            'decision': jsonDecode(decisionBody(outcome: 'HOLD')),
            'receipt': {
              'receipt_id': 'rcpt_1',
              'decision_id': 'dec_1',
              'transaction_id': 'tx_dec_1',
              'decision': 'HOLD',
              'issued_at': '2026-09-10T09:00:00Z',
              'token': null,
            },
          }),
        ),
      );
      final api = ZoneGateApi(client: fake, baseUrl: 'http://test');

      final result = await api.requestAuthorization(
        TransactionRequest(
          transactionId: 'tx_1',
          actorId: 'usr_cargo_operator_01',
          action: 'RELEASE_CARGO',
          resourceId: 'CT-1',
          zone: 'PORT_GATE_17',
          timestamp: DateTime.utc(2026, 9, 10, 9),
          value: '25000.00',
        ),
      );

      expect(result.decision.decision, DecisionOutcome.hold);
      expect(result.receipt.token, isNull);

      final sent = jsonDecode(
        (fake.requests.first as http.Request).body,
      ) as Map<String, dynamic>;
      expect(sent['resource_id'], 'CT-1');
      expect(sent['actor_id'], 'usr_cargo_operator_01');
    });
  });

  group('hold resolution', () {
    test('posts the verdict to the decision path', () async {
      final fake = FakeClient(
        (_) => (
          status: 201,
          body: jsonEncode({
            'decision': jsonDecode(
              decisionBody(
                outcome: 'HOLD',
                resolution: {
                  'outcome': 'APPROVE',
                  'resolved_by': 'usr_cargo_supervisor_02',
                  'authority_role': 'ROLE_CARGO_SUPERVISOR',
                  'note': 'cleared',
                  'resolved_at': '2026-09-10T10:00:00Z',
                },
              ),
            ),
            'receipt': {
              'receipt_id': 'rcpt_1',
              'decision_id': 'dec_1',
              'transaction_id': 'tx_dec_1',
              'decision': 'HOLD',
              'issued_at': '2026-09-10T10:00:00Z',
              'token': 'signature',
            },
          }),
        ),
      );
      final api = ZoneGateApi(client: fake, baseUrl: 'http://test');

      final result = await api.resolveHold(
        decisionId: 'dec_1',
        outcome: DecisionOutcome.approve,
        resolvedBy: 'usr_cargo_supervisor_02',
        note: 'cleared',
      );

      expect(result.decision.effectiveOutcome, DecisionOutcome.approve);
      expect(result.receipt.token, 'signature');
      expect(fake.requests.first.url.path, '/v1/authorizations/dec_1/resolve');
    });

    test('a 409 conflict is reported with its status', () async {
      final api = ZoneGateApi(
        client: FakeClient(
          (_) => (
            status: 409,
            body: jsonEncode({'detail': 'already resolved'}),
          ),
        ),
        baseUrl: 'http://test',
      );

      await expectLater(
        api.resolveHold(
          decisionId: 'dec_1',
          outcome: DecisionOutcome.approve,
          resolvedBy: 'usr_1',
        ),
        throwsA(
          isA<ApiException>().having((e) => e.statusCode, 'statusCode', 409),
        ),
      );
    });
  });

  group('health', () {
    test('reports dependency states as the backend gave them', () async {
      final api = ZoneGateApi(
        client: FakeClient(
          (_) => (
            status: 200,
            body: jsonEncode({
              'status': 'healthy',
              'dependencies': {
                'zova_persistence': 'connected',
                'ollama_agent_runtime': 'unavailable',
              },
            }),
          ),
        ),
        baseUrl: 'http://test',
      );

      final report = await api.health();

      expect(report['status'], 'healthy');
      expect(
        (report['dependencies'] as Map)['ollama_agent_runtime'],
        'unavailable',
      );
    });
  });
}
