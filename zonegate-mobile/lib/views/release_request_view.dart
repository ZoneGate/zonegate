import 'package:flutter/material.dart';

import '../models/policy_decision.dart';
import '../services/session.dart';
import '../theme/app_colors.dart';
import '../widgets/app_text_field.dart';
import 'agent_progress_view.dart';

/// The field operator's action: ask ZoneGate to authorize a cargo release.
///
/// Submitting hands over to [AgentProgressView], which runs the pipeline and
/// shows each step as the backend reaches it. Where it lands is the whole
/// point of the product:
///   APPROVE -> confirmation
///   DENY    -> security alert, blocked at the policy layer
///   HOLD    -> handed to a named human, decided from the operations console
class ReleaseRequestView extends StatefulWidget {
  const ReleaseRequestView({super.key});

  @override
  State<ReleaseRequestView> createState() => _ReleaseRequestViewState();
}

class _ReleaseRequestViewState extends State<ReleaseRequestView> {
  final _resourceController = TextEditingController();
  final _zoneController = TextEditingController(text: 'PORT_GATE_17');
  final _valueController = TextEditingController(text: '15000.00');

  /// The categories the backend knows. Which of these are restricted is
  /// policy, and policy is the backend's to apply -- this screen only says
  /// what is in the container.
  static const List<String> _categories = [
    'GENERAL',
    'PERISHABLE',
    'HIGH_VALUE',
    'HAZARDOUS',
    'CONTROLLED_SUBSTANCE',
    'WEAPONS',
  ];

  String _category = 'GENERAL';

  String? _error;

  @override
  void dispose() {
    _resourceController.dispose();
    _zoneController.dispose();
    _valueController.dispose();
    super.dispose();
  }

  void _submit() {
    final actor = Session.actor;

    if (actor == null) {
      setState(() => _error = 'No actor is signed in on this device.');
      return;
    }

    final resource = _resourceController.text.trim();
    if (resource.isEmpty) {
      setState(() => _error = 'Enter the container or resource identifier.');
      return;
    }

    setState(() => _error = null);

    final now = DateTime.now().toUtc();

    final transaction = TransactionRequest(
      // Correlation id for this attempt; the backend keys its records on it.
      transactionId: 'tx_mobile_${now.millisecondsSinceEpoch}',
      actorId: actor.actorId,
      action: 'RELEASE_CARGO',
      resourceId: resource,
      zone: _zoneController.text.trim(),
      timestamp: now,
      value: _valueController.text.trim(),
      category: _category,
    );

    Navigator.of(context).pushReplacement(
      MaterialPageRoute(
        builder: (_) => AgentProgressView(transaction: transaction),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final actor = Session.actor;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        elevation: 0,
        foregroundColor: const Color(0xFF12242A),
        title: const Text(
          'Request Cargo Release',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
        ),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
          children: [
            const Text(
              'ZoneGate will collect network evidence for your bound device '
              'before anything is released.',
              style: TextStyle(
                fontSize: 13,
                height: 1.4,
                color: AppColors.sectionLabel,
              ),
            ),
            const SizedBox(height: 22),

            const _FieldLabel('CONTAINER / RESOURCE'),
            AppTextField(
              hintText: 'CT-928411',
              controller: _resourceController,
            ),
            const SizedBox(height: 16),

            const _FieldLabel('TARGET ZONE'),
            AppTextField(hintText: 'PORT_GATE_17', controller: _zoneController),
            const SizedBox(height: 16),

            const _FieldLabel('CARGO CATEGORY'),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14),
              decoration: BoxDecoration(
                color: AppColors.fieldFill,
                borderRadius: BorderRadius.circular(10),
              ),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  value: _category,
                  isExpanded: true,
                  borderRadius: BorderRadius.circular(10),
                  style: const TextStyle(
                    fontSize: 14,
                    color: Colors.black87,
                    fontWeight: FontWeight.w600,
                  ),
                  items: [
                    for (final category in _categories)
                      DropdownMenuItem(value: category, child: Text(category)),
                  ],
                  onChanged: (value) {
                    if (value != null) setState(() => _category = value);
                  },
                ),
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'A restricted category is never released automatically: it is '
              'handed to the role the policy names for it.',
              style: TextStyle(
                fontSize: 11,
                height: 1.4,
                color: AppColors.sectionLabel,
              ),
            ),
            const SizedBox(height: 16),

            const _FieldLabel('DECLARED VALUE (USD)'),
            AppTextField(
              hintText: '15000.00',
              controller: _valueController,
              keyboardType: TextInputType.number,
            ),
            const SizedBox(height: 20),

            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.innerFill,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.cardBorder),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'REQUESTING AS',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: AppColors.sectionLabel,
                      letterSpacing: 0.3,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    actor?.actorId ?? 'NOT ENROLLED',
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text(
                    actor == null
                        ? 'Sign in before requesting a release.'
                        : '${actor.roleLabel} · device ${Session.binding?.shortReference ?? '—'}',
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppColors.sectionLabel,
                    ),
                  ),
                ],
              ),
            ),

            if (_error != null) ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
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
            ],

            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton(
                onPressed: _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primaryTeal,
                  foregroundColor: AppColors.buttonText,
                  disabledBackgroundColor:
                      AppColors.primaryTeal.withValues(alpha: 0.5),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  elevation: 0,
                ),
                child: const Text(
                  'Request Authorization',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FieldLabel extends StatelessWidget {
  final String text;
  const _FieldLabel(this.text);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Text(
        text,
        style: const TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: AppColors.sectionLabel,
          letterSpacing: 0.3,
        ),
      ),
    );
  }
}
