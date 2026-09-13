/**
 * How one network evidence check reads on the console.
 *
 * A tick or a cross says whether the check came out in the actor's favour, and
 * a short line says what the carrier actually reported. TRUE and FALSE were
 * exact but not readable: whether `recent_sim_swap: false` is good news
 * depends on knowing that a swap is the bad outcome.
 *
 * An empty reading has three different causes, and they mean different things
 * to the person reading the record:
 *
 * - the plan never asked for the check (the agent judged it unnecessary);
 * - number verification, which the workflow requires but this deployment's
 *   carrier cannot attest at all, so the validator dropped it from the plan
 *   and the decision carries a caveat;
 * - a check that was on the plan and the carrier did not answer.
 *
 * None of those is a pass or a failure, so they get neither a tick nor a cross.
 */

export interface PlanOutline {
    mandatory: string[];
    combined: string[];
}

export type EvidenceTone = "pass" | "fail" | "none";

export interface EvidenceCheck {
    tone: EvidenceTone;
    detail: string;
}

type Wording = {
    /** Whether a `true` reading is the good outcome. False for the swap checks. */
    trueIsGood: boolean;
    whenTrue: string;
    whenFalse: string;
};

const WORDING: Record<string, Wording> = {
    NUMBER_VERIFICATION: {
        trueIsGood: true,
        whenTrue: "The carrier confirmed the registered number on this device.",
        whenFalse: "The carrier did not confirm the registered number.",
    },
    LOCATION_VERIFICATION: {
        trueIsGood: true,
        whenTrue: "The network placed the device inside the zone.",
        whenFalse: "The network placed the device outside the zone.",
    },
    SIM_SWAP: {
        trueIsGood: false,
        whenTrue: "The SIM on this line was swapped recently.",
        whenFalse: "No recent SIM swap on this line.",
    },
    DEVICE_SWAP: {
        trueIsGood: false,
        whenTrue: "This line moved to a different device recently.",
        whenFalse: "The line is still on the same device.",
    },
    REACHABILITY: {
        trueIsGood: true,
        whenTrue: "The device is connected to the network.",
        whenFalse: "The device is not connected to the network.",
    },
};

export function evidenceCheck(
    kind: string,
    state: boolean | null | undefined,
    plan: PlanOutline | null | undefined
): EvidenceCheck {
    const wording = WORDING[kind];

    if (state === true || state === false) {
        if (!wording) return { tone: "none", detail: state ? "Reported true." : "Reported false." };
        const good = state === wording.trueIsGood;
        return { tone: good ? "pass" : "fail", detail: state ? wording.whenTrue : wording.whenFalse };
    }

    if (!plan) return { tone: "none", detail: "No result was recorded for this check." };
    if (plan.combined.includes(kind)) {
        return { tone: "none", detail: "Requested, but the carrier did not answer." };
    }
    // Number verification is mandatory for every release, so the only way it
    // leaves the plan is the validator dropping it as unattestable.
    if (kind === "NUMBER_VERIFICATION") {
        return { tone: "none", detail: "The carrier cannot attest this over the network." };
    }
    return { tone: "none", detail: "Not requested for this decision." };
}
