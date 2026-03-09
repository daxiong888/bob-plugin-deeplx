const test = require("node:test");
const assert = require("node:assert/strict");

const helpers = require("../src/main.js").__test__;

test("buildAlternatives removes duplicates and main-text repeats", function() {
    assert.deepEqual(
        helpers.buildAlternatives("Official account", [
            "Official account",
            " Official   account ",
            "Verified account",
            "Official profile",
            ""
        ]),
        [
            "Verified account",
            "Official profile"
        ]
    );
});
