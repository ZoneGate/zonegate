import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/api_config.dart';
import '../models/actor.dart';
import '../models/pipeline_stage.dart';
import '../models/policy_decision.dart';

/// Raised when the API cannot be reached or answers with an error.
class ApiException implements Exception {
  final String message;
  final int statusCode;

  const ApiException(this.message, [this.statusCode = 0]);

  /// True when the request never reached the server.
  bool get isUnreachable => statusCode == 0;

  @override
  String toString() => message;
}

/// Client for the ZoneGate authorization API.
///
/// This is the same API the operations dashboard talks to. Nothing special is
/// needed to serve both: an HTTP server answers whoever calls it, so the only
/// difference between the two clients is the base URL each one uses to reach
/// it (see [ApiConfig]).
class ZoneGateApi {
  final http.Client _client;
  final String baseUrl;

  ZoneGateApi({http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        baseUrl = baseUrl ?? ApiConfig.baseUrl;

  Uri _uri(String path, [Map<String, String>? query]) =>
      Uri.parse('$baseUrl$path').replace(queryParameters: query);

  Future<dynamic> _send(Future<http.Response> Function() call) async {
    http.Response response;

    try {
      response = await call().timeout(ApiConfig.timeout);
    } catch (error) {
      throw ApiException(
        'Cannot reach the authorization API at $baseUrl. '
        'Check that the backend is running and that this device can see it.',
      );
    }

    if (response.statusCode >= 400) {
      String detail = 'HTTP ${response.statusCode}';

      try {
        final body = jsonDecode(response.body);
        if (body is Map && body['detail'] != null) {
          detail = body['detail'].toString();
        }
      } catch (_) {
        // A non-JSON body leaves the status line as the message.
      }

      throw ApiException(detail, response.statusCode);
    }

    if (response.body.isEmpty) return null;
    return jsonDecode(utf8.decode(response.bodyBytes));
  }

  /// Service health plus reachability of its dependencies.
  Future<Map<String, dynamic>> health() async {
    final body = await _send(() => _client.get(_uri('/health')));
    return Map<String, dynamic>.from(body as Map);
  }

  /// Policy decisions, newest first.
  ///
  /// [outcome] filters by APPROVE / HOLD / DENY; [pendingOnly] narrows a HOLD
  /// listing to the ones still waiting on their human authority.
  Future<List<PolicyDecision>> listDecisions({
    DecisionOutcome? outcome,
    bool pendingOnly = false,
    int limit = 100,
  }) async {
    final query = <String, String>{'limit': '$limit'};
    if (outcome != null) query['decision'] = outcomeLabel(outcome);
    if (pendingOnly) query['pending'] = 'true';

    final body = await _send(() => _client.get(_uri('/v1/authorizations', query)));

    return (body as List<dynamic>)
        .map((item) => PolicyDecision.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  /// Decisions with the transaction and evidence behind each, in one call.
  ///
  /// Screens that show what a decision was *about* would otherwise fetch the
  /// per-decision context once per row.
  Future<List<DecisionContext>> listDecisionContexts({
    DecisionOutcome? outcome,
    bool pendingOnly = false,
    int limit = 25,
  }) async {
    final query = <String, String>{'limit': '$limit'};
    if (outcome != null) query['decision'] = outcomeLabel(outcome);
    if (pendingOnly) query['pending'] = 'true';

    final body = await _send(
      () => _client.get(_uri('/v1/authorizations/contexts', query)),
    );

    return (body as List<dynamic>)
        .map((item) => DecisionContext.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  /// Looks up an enrolled actor together with their active device binding.
  ///
  /// Returns null when the actor is not enrolled, which is the state the
  /// authorization pipeline would answer DENY on.
  Future<Enrollment?> enrollment(String actorId) async {
    try {
      final body = await _send(
        () => _client.get(_uri('/v1/actors/${Uri.encodeComponent(actorId)}')),
      );
      return Enrollment.fromJson(body as Map<String, dynamic>);
    } on ApiException catch (error) {
      if (error.statusCode == 404) return null;
      rethrow;
    }
  }

  /// A decision together with the transaction and network evidence behind it.
  Future<DecisionContext> decisionContext(String decisionId) async {
    final body = await _send(
      () => _client.get(_uri('/v1/authorizations/$decisionId/context')),
    );
    return DecisionContext.fromJson(body as Map<String, dynamic>);
  }

  /// Runs a transaction through the full authorization pipeline.
  Future<AuthorizationResult> requestAuthorization(
    TransactionRequest transaction,
  ) async {
    final body = await _send(
      () => _client.post(
        _uri('/v1/authorizations'),
        headers: const {'Content-Type': 'application/json'},
        body: jsonEncode(transaction.toJson()),
      ),
    );
    return AuthorizationResult.fromJson(body as Map<String, dynamic>);
  }

  /// The same pipeline, reported as it runs.
  ///
  /// Yields a [StageEvent] as each of the six steps starts and finishes, then
  /// one [AuthorizationResult]. The result is the same payload
  /// [requestAuthorization] returns; the events exist so the operator can see
  /// which step the request is on instead of watching a spinner.
  ///
  /// The stream ends when the pipeline does. A transport failure arrives as an
  /// [ApiException] on the stream rather than a silent close, so a caller can
  /// never mistake a dropped connection for a decision.
  Stream<Object> streamAuthorization(TransactionRequest transaction) async* {
    final request = http.Request('POST', _uri('/v1/authorizations/stream'))
      ..headers.addAll(const {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      })
      ..body = jsonEncode(transaction.toJson());

    http.StreamedResponse response;

    try {
      response = await _client.send(request).timeout(ApiConfig.streamTimeout);
    } catch (error) {
      throw ApiException(
        'Cannot reach the authorization API at $baseUrl. '
        'Check that the backend is running and that this device can see it.',
      );
    }

    if (response.statusCode >= 400) {
      final body = await response.stream.bytesToString();
      String detail = 'HTTP ${response.statusCode}';

      try {
        final parsed = jsonDecode(body);
        if (parsed is Map && parsed['detail'] != null) {
          detail = parsed['detail'].toString();
        }
      } catch (_) {
        // A non-JSON body leaves the status line as the message.
      }

      throw ApiException(detail, response.statusCode);
    }

    // Server-sent events: `event:` then `data:`, frames split by a blank line.
    var eventName = '';
    final lines = response.stream
        .transform(utf8.decoder)
        .transform(const LineSplitter());

    await for (final line in lines) {
      if (line.startsWith('event:')) {
        eventName = line.substring(6).trim();
        continue;
      }

      if (!line.startsWith('data:')) continue;

      final data = line.substring(5).trim();
      if (data.isEmpty) continue;

      final decoded = jsonDecode(data);
      if (decoded is! Map<String, dynamic>) continue;

      switch (eventName) {
        case 'stage':
          final event = StageEvent.fromJson(decoded);
          if (event != null) yield event;
        case 'result':
          yield AuthorizationResult.fromJson(decoded);
        case 'error':
          throw ApiException(
            decoded['detail']?.toString() ?? 'The authorization pipeline failed.',
          );
      }
    }
  }

  /// Records the binding human decision on a HOLD.
  ///
  /// Only a HOLD is eligible; the backend answers 409 for anything else, so a
  /// deterministic DENY can never be overridden from a client.
  Future<AuthorizationResult> resolveHold({
    required String decisionId,
    required DecisionOutcome outcome,
    required String resolvedBy,
    String note = '',
  }) async {
    final body = await _send(
      () => _client.post(
        _uri('/v1/authorizations/$decisionId/resolve'),
        headers: const {'Content-Type': 'application/json'},
        body: jsonEncode({
          'outcome': outcomeLabel(outcome),
          'resolved_by': resolvedBy,
          'note': note,
        }),
      ),
    );
    return AuthorizationResult.fromJson(body as Map<String, dynamic>);
  }

  void dispose() => _client.close();
}
