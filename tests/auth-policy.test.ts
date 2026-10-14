import { test } from "node:test";
import assert from "node:assert/strict";
import { hasAdminClaim, isRecentSignIn, isSameOriginRequest } from "../src/lib/auth/policy";

test("seul le rôle admin booléen accorde l’accès", () => {
  for (const claims of [undefined, {}, { admin: false }, { admin: "true" }, { role: "admin" }, { admin: 1 }]) assert.equal(hasAdminClaim(claims), false);
  assert.equal(hasAdminClaim({ admin: true, other: "retained" }), true);
});

test("une session exige une authentification récente, avec une tolérance d’horloge limitée", () => {
  assert.equal(isRecentSignIn(1000, 1299), true);
  assert.equal(isRecentSignIn(1000, 1300), false);
  assert.equal(isRecentSignIn(1000, 939), false);
  assert.equal(isRecentSignIn(Number.NaN, 1000), false);
});

test("les mutations refusent les origines étrangères, nulles et les sous-domaines", () => {
  const expected = "https://nagi.example";
  for (const origin of [null, "null", "http://nagi.example", "https://evil.example", "https://sub.nagi.example", "https://nagi.example.evil.example"]) assert.equal(isSameOriginRequest(origin, expected, "same-origin"), false);
  assert.equal(isSameOriginRequest(expected, expected, "cross-site"), false);
  assert.equal(isSameOriginRequest(expected, expected, "same-site"), false);
  assert.equal(isSameOriginRequest(expected, expected, "same-origin"), true);
  assert.equal(isSameOriginRequest(expected, expected, null), true);
});
