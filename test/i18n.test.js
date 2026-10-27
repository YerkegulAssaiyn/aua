import test from "node:test";
import assert from "node:assert/strict";
import { STRINGS, makeT } from "../js/i18n.js";

test("all languages have the same keys", () => {
  const en = Object.keys(STRINGS.en).sort();
  for (const lang of ["ru", "kk"]) assert.deepEqual(Object.keys(STRINGS[lang]).sort(), en, lang);
});
test("placeholders are filled", () => {
  assert.equal(makeT("ru")("b_moisture", { value: 41 }), "Потому что увлажнённость 41");
});
