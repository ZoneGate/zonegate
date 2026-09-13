import '../models/actor.dart';

/// The actor this device is operating as.
///
/// The backend has no authentication yet: `POST /v1/actors` enrols an actor and
/// binds a device, and every authorization is checked against that binding.
/// Signing in here therefore means "confirm this actor is enrolled and remember
/// them for this session", not "verify a password". Replace this the moment the
/// API grows a real credential exchange.
class Session {
  Session._();

  static Actor? _actor;
  static DeviceBinding? _binding;

  static Actor? get actor => _actor;
  static DeviceBinding? get binding => _binding;

  static bool get isSignedIn => _actor != null;

  static String get actorId => _actor?.actorId ?? 'NOT ENROLLED';

  static String get roleLabel => _actor?.roleLabel ?? 'NO ACTOR BOUND';

  static void signIn(Enrollment enrollment) {
    _actor = enrollment.actor;
    _binding = enrollment.binding;
  }

  static void signOut() {
    _actor = null;
    _binding = null;
  }
}
