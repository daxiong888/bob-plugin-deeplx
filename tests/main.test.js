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

test("parseUrls supports commas and newlines", function() {
    assert.deepEqual(
        helpers.parseUrls(" https://a.example/translate,\nhttps://b.example/translate \n\n, https://c.example/translate "),
        [
            "https://a.example/translate",
            "https://b.example/translate",
            "https://c.example/translate"
        ]
    );
});

test("parseRequestTimeout clamps invalid values", function() {
    assert.equal(helpers.parseRequestTimeout("abc"), 8);
    assert.equal(helpers.parseRequestTimeout("1"), 3);
    assert.equal(helpers.parseRequestTimeout("60"), 30);
    assert.equal(helpers.parseRequestTimeout("12"), 12);
});

test("computePluginTimeout scales with endpoint count and stays bounded", function() {
    assert.equal(helpers.computePluginTimeout(1, 8), 30);
    assert.equal(helpers.computePluginTimeout(4, 20), 85);
    assert.equal(helpers.computePluginTimeout(20, 20), 300);
});

test("buildHeaders omits empty auth token", function() {
    assert.deepEqual(helpers.buildHeaders(""), {
        "Content-Type": "application/json"
    });

    assert.deepEqual(helpers.buildHeaders(" secret "), {
        "Content-Type": "application/json",
        Authorization: "Bearer secret"
    });
});
