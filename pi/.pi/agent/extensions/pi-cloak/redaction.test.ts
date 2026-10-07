import assert from "node:assert/strict";
import test from "node:test";
import { redactJson, redactText, type CompiledCloakPattern } from "./redaction.ts";

const patterns: CompiledCloakPattern[] = [
  { source: "env", regex: /(API_KEY=)[^\s]+/gi, replace: "$1" },
  { source: "bearer", regex: /(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, replace: "$1" },
];
const config = { cloakCharacter: "*", cloakLength: null, tryAllPatterns: true };

test("redacts secrets from arbitrary text tool results", () => {
  const result = redactText("API_KEY=secret\nAuthorization: Bearer abc.def", patterns, config);
  assert.equal(result.changed, true);
  assert.equal(result.text.includes("secret"), false);
  assert.equal(result.text.includes("abc.def"), false);
  assert.match(result.text, /^API_KEY=\*+/);
});

test("redacts sensitive structured fields without discarding shape", () => {
  const result = redactJson({ token: "secret", nested: { status: "ok" } }, patterns, config);
  assert.deepEqual(result.value, { token: "******", nested: { status: "ok" } });
  assert.equal(result.changed, true);
});
