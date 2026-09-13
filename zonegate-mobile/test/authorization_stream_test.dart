// Tests for the streamed authorization pipeline.
//
// The progress screen is only worth anything if it reports what actually
// happened. What is pinned here is that stage events reach the caller in
// order, that the closing result is a decision and not a guess, and that a
// stream which dies mid-pipeline raises rather than quietly looking finished —
// an operator must never read a dropped connection as an approval.

import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:is_takip_uygulamasi/models/pipeline_stage.dart';
import 'package:is_takip_uygulamasi/models/policy_decision.dart';
import 'package:is_takip_uygulamasi/services/zonegate_api.dart';

/// Streams a canned SSE body back, frame by frame.
class FakeStreamClient extends http.BaseClient {
  FakeStreamClient(this.frames, {this.status = 200});

  final List<String> frames;
  final int status;
  final List<http.BaseRequest> requests = [];

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    requests.add(request);

    final controller = StreamController<List<int>>();

    scheduleMicrotask(() async {
      for (final frame in frames) {
        controller.add(utf8.encode(frame));
      }
      await controller.close();
    });

    return http.StreamedResponse(controller.stream, status);
  }
}

String stageFrame(String stage, String status, {String detail = ''}) =>
    'event: stage\n'
    'data: ${jsonEncode({
          'stage': stage,
          'status': status,
          'label': 'doing $stage',
          'detail': detail,
        })}\n\n';

String resultFrame(String outcome) => 'event: result\n'
    'data: ${jsonEncode({
          'decision': {
            'decision_id': 'dec_abc123',
            'transaction_id': 'tx_1',
            'decision': outcome,
            'reasons': ['because'],
            'decided_at': '2026-09-10T14:30:00Z',
          },
          'receipt': {
            'receipt_id': 'rcpt_abc123',
            'decision_id': 'dec_abc123',
            'transaction_id': 'tx_1',
            'decision': outcome,
            'issued_at': '2026-09-10T14:30:00Z',
          },
        })}\n\n';

TransactionRequest transaction({String category = 'GENERAL'}) => TransactionRequest(
      transactionId: 'tx_1',
      actorId: 'usr_cargo_operator_01',
      action: 'RELEASE_CARGO',
      resourceId: 'CT-700',
      zone: 'ZONE_CARGO_BAY_1',
      timestamp: DateTime.utc(2026, 9, 10, 14, 30),
      value: '15000.00',
      category: category,
    );

void main() {
  group('streamed authorization', () {
    test('yields each stage in order, then the result', () async {
      final client = FakeStreamClient([
        stageFrame('IDENTITY', 'STARTED'),
        stageFrame('IDENTITY', 'DONE', detail: 'bound'),
        stageFrame('EVIDENCE', 'STARTED'),
        stageFrame('EVIDENCE', 'DONE'),
        stageFrame('POLICY', 'DONE'),
        resultFrame('APPROVE'),
      ]);

      final api = ZoneGateApi(client: client, baseUrl: 'http://test');
      final received = await api.streamAuthorization(transaction()).toList();

      final stages = received.whereType<StageEvent>().toList();
      expect(stages.map((event) => event.stage), [
        PipelineStage.identity,
        PipelineStage.identity,
        PipelineStage.evidence,
        PipelineStage.evidence,
        PipelineStage.policy,
      ]);
      expect(stages[1].detail, 'bound');
      expect(received.last, isA<AuthorizationResult>());
    });

    test('the closing result carries the decision the engine made', () async {
      final client = FakeStreamClient([resultFrame('DENY')]);
      final api = ZoneGateApi(client: client, baseUrl: 'http://test');

      final received = await api.streamAuthorization(transaction()).toList();
      final result = received.last as AuthorizationResult;

      expect(result.decision.decision, DecisionOutcome.deny);
      expect(result.receipt.decisionId, 'dec_abc123');
    });

    test('posts the cargo category with the transaction', () async {
      final client = FakeStreamClient([resultFrame('APPROVE')]);
      final api = ZoneGateApi(client: client, baseUrl: 'http://test');

      await api.streamAuthorization(transaction(category: 'HAZARDOUS')).toList();

      final request = client.requests.single as http.Request;
      expect(jsonDecode(request.body)['category'], 'HAZARDOUS');
      expect(request.url.path, '/v1/authorizations/stream');
    });

    test('an error event is raised, never mistaken for a decision', () async {
      final client = FakeStreamClient([
        stageFrame('IDENTITY', 'STARTED'),
        'event: error\ndata: ${jsonEncode({'detail': 'the pipeline broke'})}\n\n',
      ]);
      final api = ZoneGateApi(client: client, baseUrl: 'http://test');

      await expectLater(
        api.streamAuthorization(transaction()),
        emitsInOrder([
          isA<StageEvent>(),
          emitsError(
            isA<ApiException>().having(
              (error) => error.message,
              'message',
              'the pipeline broke',
            ),
          ),
        ]),
      );
    });

    test('a rejected request raises with the backend detail', () async {
      final client = FakeStreamClient(
        [jsonEncode({'detail': 'Actor is not enrolled'})],
        status: 400,
      );
      final api = ZoneGateApi(client: client, baseUrl: 'http://test');

      await expectLater(
        api.streamAuthorization(transaction()).toList(),
        throwsA(
          isA<ApiException>()
              .having((error) => error.statusCode, 'statusCode', 400)
              .having((error) => error.message, 'message', 'Actor is not enrolled'),
        ),
      );
    });

    test('a stage the app does not know is ignored, not shown as broken', () async {
      final client = FakeStreamClient([
        stageFrame('QUANTUM_ORACLE', 'DONE'),
        stageFrame('POLICY', 'DONE'),
        resultFrame('APPROVE'),
      ]);
      final api = ZoneGateApi(client: client, baseUrl: 'http://test');

      final received = await api.streamAuthorization(transaction()).toList();

      expect(received.whereType<StageEvent>().single.stage, PipelineStage.policy);
    });
  });

  group('stage progress', () {
    test('a later event with no detail keeps what an earlier one reported', () {
      // STARTED carries the plan and DONE carries the outcome; a blank DONE
      // must not wipe the line the operator is already reading.
      const row = StageProgress(
        stage: PipelineStage.evidence,
        status: StageStatus.started,
        detail: 'NUMBER_VERIFICATION, LOCATION_VERIFICATION',
      );

      final next = row.copyWith(status: StageStatus.done, detail: '');

      expect(next.status, StageStatus.done);
      expect(next.detail, 'NUMBER_VERIFICATION, LOCATION_VERIFICATION');
    });

    test('every stage has a title, so no row can render blank', () {
      for (final stage in pipelineOrder) {
        expect(stageTitle(stage).trim(), isNotEmpty);
      }
    });

    test('the order matches the pipeline the backend runs', () {
      expect(pipelineOrder, [
        PipelineStage.identity,
        PipelineStage.plan,
        PipelineStage.validate,
        PipelineStage.evidence,
        PipelineStage.context,
        PipelineStage.policy,
      ]);
    });
  });
}
