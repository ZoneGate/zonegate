/// Enterprise identity and the device it is bound to.
///
/// The Evidence Gateway checks every carrier call against this binding, so an
/// actor without an active binding can never pass authorization.
class Actor {
  final String actorId;
  final String role;
  final List<String> permissions;
  final String registeredPhoneNumber;
  final String registeredDeviceId;
  final String enrollmentStatus;

  const Actor({
    required this.actorId,
    required this.role,
    required this.permissions,
    required this.registeredPhoneNumber,
    required this.registeredDeviceId,
    required this.enrollmentStatus,
  });

  factory Actor.fromJson(Map<String, dynamic> json) {
    return Actor(
      actorId: json['actor_id']?.toString() ?? '',
      role: json['role']?.toString() ?? '',
      permissions: (json['permissions'] as List<dynamic>? ?? [])
          .map((permission) => permission.toString())
          .toList(),
      registeredPhoneNumber: json['registered_phone_number']?.toString() ?? '',
      registeredDeviceId: json['registered_device_id']?.toString() ?? '',
      enrollmentStatus: json['enrollment_status']?.toString() ?? '',
    );
  }

  /// `+14155550199` rendered as `+1415•••0199`, so the full subscriber number
  /// is not readable over the operator's shoulder at a gate.
  String get maskedPhone {
    if (registeredPhoneNumber.length < 9) return registeredPhoneNumber;

    final head = registeredPhoneNumber.substring(0, 5);
    final tail =
        registeredPhoneNumber.substring(registeredPhoneNumber.length - 4);
    return '$head•••$tail';
  }

  String get roleLabel => role.replaceAll('_', ' ');

  /// Cargo personnel, who use this app. Supervisors and officers decide on
  /// the web console instead. Matches the backend: the `ROLE_` prefix and
  /// case do not change the job.
  bool get isFieldPersonnel {
    var value = role.trim().toUpperCase();
    if (value.startsWith('ROLE_')) value = value.substring('ROLE_'.length);
    return value == 'CARGO_OPERATOR';
  }
}

class DeviceBinding {
  final String actorId;
  final String phoneNumber;
  final String deviceId;
  final DateTime boundAt;
  final bool isActive;

  const DeviceBinding({
    required this.actorId,
    required this.phoneNumber,
    required this.deviceId,
    required this.boundAt,
    required this.isActive,
  });

  factory DeviceBinding.fromJson(Map<String, dynamic> json) {
    return DeviceBinding(
      actorId: json['actor_id']?.toString() ?? '',
      phoneNumber: json['phone_number']?.toString() ?? '',
      deviceId: json['device_id']?.toString() ?? '',
      boundAt: DateTime.tryParse(json['bound_at']?.toString() ?? '')?.toUtc() ??
          DateTime.now().toUtc(),
      isActive: json['is_active'] as bool? ?? false,
    );
  }

  /// Short reference for the UI, e.g. `dev_imei_99887766` -> `99887766`.
  String get shortReference {
    final parts = deviceId.split('_');
    return parts.isEmpty ? deviceId : parts.last;
  }
}

class Enrollment {
  final Actor actor;
  final DeviceBinding binding;

  const Enrollment({required this.actor, required this.binding});

  factory Enrollment.fromJson(Map<String, dynamic> json) {
    return Enrollment(
      actor: Actor.fromJson(json['actor'] as Map<String, dynamic>),
      binding: DeviceBinding.fromJson(json['binding'] as Map<String, dynamic>),
    );
  }
}
