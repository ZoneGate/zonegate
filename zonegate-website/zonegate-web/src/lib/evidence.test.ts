import { describe, expect, it } from "vitest";

import { evidenceCheck } from "./evidence";

const plan = {
    mandatory: ["LOCATION_VERIFICATION"],
    combined: ["LOCATION_VERIFICATION", "SIM_SWAP"],
};

describe("evidenceCheck", () => {
    it("ticks a check that came out in the actor's favour", () => {
        expect(evidenceCheck("LOCATION_VERIFICATION", true, plan)).toEqual({
            tone: "pass",
            detail: "The network placed the device inside the zone.",
        });
    });

    it("reads a swap check the right way round", () => {
        expect(evidenceCheck("SIM_SWAP", false, plan).tone).toBe("pass");
        expect(evidenceCheck("SIM_SWAP", true, plan)).toEqual({
            tone: "fail",
            detail: "The SIM on this line was swapped recently.",
        });
    });

    it("crosses a failed check", () => {
        expect(evidenceCheck("REACHABILITY", false, plan).tone).toBe("fail");
    });

    it("gives an empty reading neither a tick nor a cross, and says why", () => {
        expect(evidenceCheck("SIM_SWAP", null, plan)).toEqual({
            tone: "none",
            detail: "Requested, but the carrier did not answer.",
        });
        expect(evidenceCheck("REACHABILITY", null, plan).detail).toBe("Not requested for this decision.");
        expect(evidenceCheck("NUMBER_VERIFICATION", null, plan).detail).toBe(
            "The carrier cannot attest this over the network."
        );
    });

    it("does not guess without a plan", () => {
        expect(evidenceCheck("NUMBER_VERIFICATION", null, null)).toEqual({
            tone: "none",
            detail: "No result was recorded for this check.",
        });
    });
});
