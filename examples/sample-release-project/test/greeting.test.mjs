import assert from "node:assert/strict";
import test from "node:test";

test("release fixture test command is functional", () => {
  assert.equal(`Hello, release!`, "Hello, release!");
});
