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

test("buildParagraphs smart mode merges wrapped lines into paragraphs", function() {
    assert.deepEqual(
        helpers.buildParagraphs("First line\nsecond line\n\nThird block", "smart"),
        [
            "First line second line",
            "Third block"
        ]
    );
});

test("buildParagraphs smart mode preserves list blocks", function() {
    assert.deepEqual(
        helpers.buildParagraphs("Intro line\n- First item\n- Second item\nClosing line", "smart"),
        [
            "Intro line",
            "- First item\n- Second item",
            "Closing line"
        ]
    );
});

test("buildParagraphs smart mode merges wrapped list continuations", function() {
    assert.deepEqual(
        helpers.buildParagraphs("How it works\n- When you solve it, we will review it with you, then we\nmove on.\n- Ask for a hint", "smart"),
        [
            "How it works",
            "- When you solve it, we will review it with you, then we move on.\n- Ask for a hint"
        ]
    );
});

test("buildParagraphs smart mode does not merge after a completed list sentence", function() {
    assert.deepEqual(
        helpers.buildParagraphs("Summary\n- First item is complete.\nThis starts a new paragraph", "smart"),
        [
            "Summary",
            "- First item is complete.",
            "This starts a new paragraph"
        ]
    );
});

test("buildParagraphs smart mode preserves fenced code blocks", function() {
    assert.deepEqual(
        helpers.buildParagraphs("Example\n```bash\nnpm install\nnpm run dev\n```\nDone", "smart"),
        [
            "Example",
            "```bash\nnpm install\nnpm run dev\n```",
            "Done"
        ]
    );
});

test("buildParagraphs smart mode preserves URL lines as their own block", function() {
    assert.deepEqual(
        helpers.buildParagraphs("Resources\nhttps://example.com/docs\nhttps://example.com/api\nRead more", "smart"),
        [
            "Resources",
            "https://example.com/docs\nhttps://example.com/api",
            "Read more"
        ]
    );
});

test("buildParagraphs smart mode preserves command lines as their own block", function() {
    assert.deepEqual(
        helpers.buildParagraphs("Run this\nnpm install\nnpm run dev\nDone", "smart"),
        [
            "Run this",
            "npm install\nnpm run dev",
            "Done"
        ]
    );
});

test("buildParagraphs format mode preserves original line breaks in one item", function() {
    assert.deepEqual(
        helpers.buildParagraphs("First line\n- second line\n\nThird block", "format"),
        [
            "First line\n- second line\n\nThird block"
        ]
    );
});

test("buildParagraphs legacy preserve value maps to format mode", function() {
    assert.deepEqual(
        helpers.buildParagraphs("First line\nsecond line", "preserve"),
        [
            "First line\nsecond line"
        ]
    );
});
