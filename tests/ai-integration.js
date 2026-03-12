/**
 * AI post-processing integration test.
 *
 * Calls OpenRouter API with both modes (auto / polish)
 * and prints the prompt + response for manual inspection.
 *
 * Usage:
 *   OPENROUTER_KEY=sk-or-... node tests/ai-integration.js
 *   OPENROUTER_KEY=sk-or-... AI_MODEL=google/gemini-2.5-flash node tests/ai-integration.js
 */

const helpers = require("../src/main.js").__test__;

const API_KEY = process.env.OPENROUTER_KEY;
if (!API_KEY) {
    console.error("Error: set OPENROUTER_KEY env var first.");
    process.exit(1);
}

const MODEL = helpers.resolveAiModel(process.env.AI_MODEL || "");
const API_URL = "https://openrouter.ai/api/v1/chat/completions";

// --- Sample texts that simulate real DeepLX output ---

const SAMPLES = {
    auto: {
        text: "这个功能允许用户在他们的个人资料页面上上传一个头像图片。\n当用户点击保存按钮的时候，系统将会验证图片的大小和格式。\n如果图片不符合要求，一个错误消息将被显示。",
        from: "en",
        to: "zh-Hans",
        desc: "Translation Polish — stiff machine-translated Chinese"
    },
    polish: {
        text: "这个功能允许用户在他们的个人资料页面上上传一个头像图片。\n当用户点击保存按钮的时候，系统将会验证图片的大小和格式。\n如果图片不符合要求，一个错误消息将被显示。",
        from: "en",
        to: "zh-Hans",
        desc: "Full Refine — same text, deeper rewrite expected"
    }
};

async function callOpenRouter(prompt) {
    const resp = await fetch(API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + API_KEY,
            "HTTP-Referer": "https://github.com/missuo/bob-plugin-deeplx",
            "X-Title": "Bob DeepLX Plugin (integration test)"
        },
        body: JSON.stringify({
            model: MODEL,
            messages: [
                { role: "system", content: prompt.system },
                { role: "user", content: prompt.user }
            ],
            temperature: 0.1,
            max_tokens: 2048
        })
    });

    if (!resp.ok) {
        const body = await resp.text();
        throw new Error("HTTP " + resp.status + ": " + body.slice(0, 300));
    }

    const data = await resp.json();
    const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content || !content.trim()) {
        throw new Error("Empty response from model");
    }
    return {
        content: content.trim(),
        model: data.model || MODEL,
        usage: data.usage || {}
    };
}

function separator(label) {
    const line = "=".repeat(60);
    return "\n" + line + "\n  " + label + "\n" + line;
}

async function runMode(mode) {
    const sample = SAMPLES[mode];
    const prompt = helpers.buildAiPrompt(mode, sample.text, sample.from, sample.to);

    console.log(separator(mode.toUpperCase() + " — " + sample.desc));
    console.log("\n[System Prompt]\n" + prompt.system);
    console.log("\n[User Prompt]\n" + prompt.user);

    const start = Date.now();
    const result = await callOpenRouter(prompt);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    console.log("\n[Response] (" + result.model + ", " + elapsed + "s)");
    console.log(result.content);

    if (result.usage.prompt_tokens) {
        console.log("\n[Tokens] prompt=" + result.usage.prompt_tokens +
            " completion=" + result.usage.completion_tokens +
            " total=" + result.usage.total_tokens);
    }

    return { mode, ok: true, elapsed };
}

(async function main() {
    console.log("Model: " + MODEL);
    console.log("Testing 2 modes against OpenRouter...\n");

    const results = [];
    for (const mode of ["auto", "polish"]) {
        try {
            results.push(await runMode(mode));
        } catch (err) {
            console.log(separator(mode.toUpperCase() + " — FAILED"));
            console.error(err.message);
            results.push({ mode, ok: false, error: err.message });
        }
    }

    console.log(separator("SUMMARY"));
    for (const r of results) {
        const status = r.ok ? "PASS (" + r.elapsed + "s)" : "FAIL: " + r.error;
        console.log("  " + r.mode.padEnd(8) + status);
    }
})();
