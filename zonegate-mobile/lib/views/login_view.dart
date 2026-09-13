import 'package:flutter/material.dart';

import '../services/session.dart';
import '../services/zonegate_api.dart';
import '../theme/app_colors.dart';
import '../widgets/app_text_field.dart';
import '../widgets/zonegate_logo.dart';
import 'home_view.dart';

/// Signing in confirms that this actor is enrolled and that a device is bound
/// to them, then remembers that for the session.
///
/// It is deliberately not a password check. The API's password endpoints
/// guard the web console, where a person is at a keyboard; on the handset the
/// thing being established is that this device is the one bound to this
/// actor, which the carrier attests and a password cannot. Every authorization
/// is validated against that binding rather than against a credential.
class LoginView extends StatefulWidget {
  const LoginView({super.key});

  @override
  State<LoginView> createState() => _LoginViewState();
}

class _LoginViewState extends State<LoginView> {
  final _actorController = TextEditingController(text: 'usr_cargo_operator_01');
  final ZoneGateApi _api = ZoneGateApi();

  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    // A rejection names the actor that was rejected, so it goes stale the
    // moment the operator edits the field.
    _actorController.addListener(() {
      if (_error != null) setState(() => _error = null);
    });
  }

  @override
  void dispose() {
    _actorController.dispose();
    _api.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    final actorId = _actorController.text.trim();

    if (actorId.isEmpty) {
      setState(() => _error = 'Enter the actor identifier issued to you.');
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final enrollment = await _api.enrollment(actorId);

      if (!mounted) return;

      if (enrollment == null) {
        setState(() {
          _busy = false;
          _error =
              "'$actorId' is not enrolled in ZoneGate. Every authorization is "
              'checked against an enrolled actor and an active device binding.';
        });
        return;
      }

      if (!enrollment.binding.isActive) {
        setState(() {
          _busy = false;
          _error = 'This actor has no active device binding.';
        });
        return;
      }

      if (!enrollment.actor.isFieldPersonnel) {
        setState(() {
          _busy = false;
          _error =
              "'$actorId' is ${enrollment.actor.role}. This app is for cargo "
              'personnel; supervisors and officers decide on the web console.';
        });
        return;
      }

      Session.signIn(enrollment);

      Navigator.of(
        context,
      ).pushReplacement(MaterialPageRoute(builder: (_) => const HomeView()));
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = error.message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Center(
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const ZoneGateLogo(size: 90),
                  const SizedBox(height: 16),
                  const Text(
                    'ZoneGate',
                    style: TextStyle(
                      fontSize: 34,
                      fontWeight: FontWeight.w800,
                      color: AppColors.primaryTeal,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Confirm your enrolled identity to continue',
                    style: TextStyle(
                      fontSize: 13,
                      color: AppColors.sectionLabel,
                    ),
                  ),
                  const SizedBox(height: 32),
                  AppTextField(
                    hintText: 'Actor ID',
                    controller: _actorController,
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 14),
                    Container(
                      width: double.infinity,
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
                    height: 54,
                    child: ElevatedButton(
                      onPressed: _busy ? null : _handleLogin,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primaryTeal,
                        foregroundColor: AppColors.buttonText,
                        disabledBackgroundColor: AppColors.primaryTeal
                            .withValues(alpha: 0.5),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        elevation: 0,
                      ),
                      child: _busy
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.login, size: 18),
                                SizedBox(width: 8),
                                Text(
                                  'Sign In',
                                  style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
