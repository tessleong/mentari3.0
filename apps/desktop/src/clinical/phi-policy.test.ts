import { describe, expect, it } from "vitest";

import { decidePhiRoute } from "./phi-policy";

describe("PHI route policy", () => {
  it("always permits local processing", () => {
    expect(
      decidePhiRoute({ containsPhi: true, local: true, baaAttested: false }),
    ).toEqual({ allowed: true, reason: "local_route" });
  });

  it("blocks PHI from network providers without a BAA attestation", () => {
    expect(
      decidePhiRoute({ containsPhi: true, local: false, baaAttested: false }),
    ).toEqual({ allowed: false, reason: "network_phi_blocked" });
  });

  it("permits public evidence queries without PHI", () => {
    expect(
      decidePhiRoute({ containsPhi: false, local: false, baaAttested: false }),
    ).toEqual({ allowed: true, reason: "no_phi" });
  });
});
