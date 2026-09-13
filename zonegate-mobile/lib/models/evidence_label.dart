/// How one network evidence check reads on the receipt.
///
/// A tick or a cross says whether the check came out in the operator's
/// favour, and a short line says what the carrier actually reported. TRUE and
/// FALSE were exact but not readable: whether `recent_sim_swap: false` is good
/// news depends on knowing that a swap is the bad outcome.
///
/// An empty reading has three different causes, and they mean different
/// things to the person reading the record:
///
/// - the plan never asked for the check (the agent judged it unnecessary);
/// - number verification, which the workflow requires but this deployment's
///   carrier cannot attest at all, so the validator dropped it from the plan
///   and the decision carries a caveat;
/// - a check that was on the plan and the carrier did not answer.
///
/// None of those is a pass or a failure, so `passed` is null for all three.
///
/// `planned` is the plan's combined evidence. An empty list means no plan was
/// recorded, and then nothing is guessed. Matches the web console.
class EvidenceBadge {
  /// True passed, false failed, null no result.
  final bool? passed;
  final String detail;

  const EvidenceBadge({required this.passed, required this.detail});
}

class _Wording {
  final bool trueIsGood;
  final String whenTrue;
  final String whenFalse;

  const _Wording(this.trueIsGood, this.whenTrue, this.whenFalse);
}

const _wording = <String, _Wording>{
  'NUMBER_VERIFICATION': _Wording(
    true,
    'The carrier confirmed the registered number on this device.',
    'The carrier did not confirm the registered number.',
  ),
  'LOCATION_VERIFICATION': _Wording(
    true,
    'The network placed the device inside the zone.',
    'The network placed the device outside the zone.',
  ),
  'SIM_SWAP': _Wording(
    false,
    'The SIM on this line was swapped recently.',
    'No recent SIM swap on this line.',
  ),
  'DEVICE_SWAP': _Wording(
    false,
    'This line moved to a different device recently.',
    'The line is still on the same device.',
  ),
  'REACHABILITY': _Wording(
    true,
    'The device is connected to the network.',
    'The device is not connected to the network.',
  ),
};

EvidenceBadge evidenceBadge(String kind, bool? state, List<String> planned) {
  final wording = _wording[kind];

  if (state != null) {
    if (wording == null) {
      return EvidenceBadge(
        passed: null,
        detail: state ? 'Reported true.' : 'Reported false.',
      );
    }
    return EvidenceBadge(
      passed: state == wording.trueIsGood,
      detail: state ? wording.whenTrue : wording.whenFalse,
    );
  }

  if (planned.isEmpty) {
    return const EvidenceBadge(
      passed: null,
      detail: 'No result was recorded for this check.',
    );
  }
  if (planned.contains(kind)) {
    return const EvidenceBadge(
      passed: null,
      detail: 'Requested, but the carrier did not answer.',
    );
  }
  // Number verification is mandatory for every release, so the only way it
  // leaves the plan is the validator dropping it as unattestable.
  if (kind == 'NUMBER_VERIFICATION') {
    return const EvidenceBadge(
      passed: null,
      detail: 'The carrier cannot attest this over the network.',
    );
  }
  return const EvidenceBadge(
    passed: null,
    detail: 'Not requested for this decision.',
  );
}
