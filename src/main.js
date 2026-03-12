/*
 * @Author: Vincent Young
 * @Date: 2023-03-05 16:18:02
 * @LastEditors: Vincent Young
 * @LastEditTime: 2023-11-16 03:04:30
 * @FilePath: /bob-plugin-deeplx/src/main.js
 * @Telegram: https://t.me/missuo
 *
 * Copyright © 2023 by Vincent, All Rights Reserved.
 */
var lang = require("./lang.js");
var DEFAULT_REQUEST_TIMEOUT = 8;
var MIN_REQUEST_TIMEOUT = 3;
var MAX_REQUEST_TIMEOUT = 30;
var MIN_PLUGIN_TIMEOUT = 30;
var MAX_PLUGIN_TIMEOUT = 300;
var DEFAULT_AI_TIMEOUT = 10;
var AI_OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
var DEFAULT_AI_MODEL = "google/gemini-2.5-flash-lite";

function supportLanguages() {
    return lang.supportedLanguages.map(([standardLang]) => standardLang);
}

function normalizeText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
}

function buildAlternatives(mainText, alternatives) {
    const normalizedMainText = normalizeText(mainText);
    const seen = new Set([normalizedMainText]);

    return (alternatives || []).reduce((items, item) => {
        const normalizedItem = normalizeText(item);
        if (!normalizedItem || seen.has(normalizedItem)) {
            return items;
        }
        seen.add(normalizedItem);
        items.push(item);
        return items;
    }, []);
}

function resolveDetectedLang(apiLang, fallbackLang) {
    if (!apiLang) {
        return fallbackLang;
    }
    return lang.langMapReverse.get(String(apiLang).toUpperCase()) || fallbackLang;
}

function parseUrls(rawValue) {
    return String(rawValue || "")
        .split(/[\n,]+/)
        .map(function(item) {
            return item.trim();
        })
        .filter(function(item) {
            return Boolean(item);
        });
}

function parseRequestTimeout(rawValue) {
    const parsedValue = parseInt(rawValue, 10);
    if (Number.isNaN(parsedValue)) {
        return DEFAULT_REQUEST_TIMEOUT;
    }
    return Math.max(MIN_REQUEST_TIMEOUT, Math.min(MAX_REQUEST_TIMEOUT, parsedValue));
}

function computePluginTimeout(urlCount, requestTimeoutSeconds) {
    const timeout = requestTimeoutSeconds * Math.max(urlCount, 1) + 5;
    return Math.max(MIN_PLUGIN_TIMEOUT, Math.min(MAX_PLUGIN_TIMEOUT, timeout));
}

function resolveAiModel(rawModel) {
    const m = String(rawModel || "").trim();
    return m || DEFAULT_AI_MODEL;
}

function buildAiPrompt(mode, text, fromLang, toLang) {
    const langLine = (fromLang && toLang)
        ? "- Source language: " + fromLang + ", Target language: " + toLang
        : "";

    if (mode === "auto") {
        return {
            system: "You are an expert bilingual editor specializing in post-editing machine translation output.",
            user: [
                "Post-edit the machine-translated text below for accuracy and naturalness.",
                "- Fix mistranslations and ensure the original meaning is accurately conveyed",
                "- Correct unnatural expressions, stiff phrasing, and awkward word order",
                "- Use idiomatic expressions natural to the target language",
                "- Fix OCR line-break errors if present (merge soft wraps, preserve paragraph breaks)",
                "- Do NOT touch: URLs, code blocks, inline code, command-line strings, file paths",
                "- Preserve all list and heading structures",
                "- Keep specialized terms and proper nouns unchanged",
                "- Prefer minimal changes: only edit where clearly needed",
                langLine,
                "- If the text is already accurate and natural, return it unchanged",
                "- Output the improved text only, no commentary or explanation",
                "",
                "TEXT:",
                text
            ].filter(Boolean).join("\n")
        };
    }

    return {
        system: "You are a professional translator and editor. Refine machine translation output to read as if originally written in the target language.",
        user: [
            "Refine the machine-translated text below to native-level quality.",
            "- Ensure the original meaning is faithfully preserved",
            "- Restructure sentences for natural flow in the target language",
            "- Replace literal or mechanical phrasing with idiomatic expressions",
            "- Fix OCR line-break errors if present (merge soft wraps, preserve paragraph breaks)",
            "- Do NOT touch: URLs, code blocks, inline code, command-line strings, file paths",
            "- Preserve all list and heading structures",
            "- Keep specialized terms and proper nouns unchanged",
            langLine,
            "- Output the refined text only, no commentary or explanation",
            "",
            "TEXT:",
            text
        ].filter(Boolean).join("\n")
    };
}

async function aiPostEdit(rawText, query) {
    const mode = $option.aiPostProcess;
    if (!mode || mode === "off") {
        return rawText;
    }

    if (rawText.trim().length <= 20) {
        return rawText;
    }

    const apiKey = String($option.aiApiKey || "").trim();
    if (!apiKey) {
        return rawText;
    }

    const model = resolveAiModel($option.aiModel);
    const fromLang = query.from === "auto" ? query.detectFrom : query.from;
    const toLang = query.to === "auto" ? query.detectTo : query.to;
    const prompt = buildAiPrompt(mode, rawText, fromLang, toLang);

    const resp = await $http.request({
        method: "POST",
        url: AI_OPENROUTER_URL,
        header: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + apiKey,
            "HTTP-Referer": "https://github.com/daxiong888/bob-plugin-deeplx",
            "X-Title": "Bob DeepLX Plugin"
        },
        body: {
            model: model,
            messages: [
                { role: "system", content: prompt.system },
                { role: "user", content: prompt.user }
            ],
            temperature: 0.1,
            max_tokens: 2048
        },
        timeout: DEFAULT_AI_TIMEOUT
    });

    if (resp && resp.error) {
        throw new Error(resp.error.localizedDescription || "AI API network error");
    }

    const statusCode = resp && resp.response ? resp.response.statusCode : 0;
    if (statusCode !== 200) {
        throw new Error("AI API returned status " + statusCode);
    }

    const content = (
        resp.data &&
        resp.data.choices &&
        resp.data.choices[0] &&
        resp.data.choices[0].message &&
        resp.data.choices[0].message.content
    );
    if (!content || !content.trim()) {
        throw new Error("AI API returned empty content");
    }

    return content.trim();
}

function buildHeaders(accessToken) {
    const headers = {
        "Content-Type": "application/json"
    };
    const normalizedToken = String(accessToken || "").trim();
    if (normalizedToken) {
        headers.Authorization = "Bearer " + normalizedToken;
    }
    return headers;
}

function stripTrailingWhitespace(line) {
    return String(line || "").replace(/\s+$/g, "");
}

function isCodeFenceLine(trimmedLine) {
    return /^(?:```|~~~)/.test(trimmedLine);
}

function isListLine(trimmedLine) {
    return /^(?:[-*+•]\s+|\d+[.)]\s+|[a-zA-Z][.)]\s+|[-*+]\s+\[[ xX]\]\s+)/.test(trimmedLine);
}

function stripListMarker(text) {
    return String(text || "").replace(/^(?:[-*+•]\s+|\d+[.)]\s+|[a-zA-Z][.)]\s+|[-*+]\s+\[[ xX]\]\s+)/, "");
}

function isUrlLine(trimmedLine) {
    return /^(?:(?:https?|ftp):\/\/|www\.)\S+$/i.test(trimmedLine);
}

function isCommandLine(trimmedLine) {
    if (/^(?:\$|%|>)\s+\S+/.test(trimmedLine)) {
        return true;
    }

    const lowerLine = trimmedLine.toLowerCase();
    return /^(?:curl|wget|git|npm|pnpm|yarn|bun|npx|pip|pip3|python|python3|node|brew|docker|kubectl|make|cmake|go|cargo|java|javac|mvn|gradle|composer|bundle|rails|gem|uv|poetry|conda|ssh|scp|rsync|ffmpeg|ls|cd|cp|mv|mkdir|rm|cat|sed|awk|grep|rg|find|chmod|chown|sudo|export|source)\b/.test(lowerLine);
}

function getStructuredLineKind(trimmedLine) {
    if (isListLine(trimmedLine)) {
        return "list";
    }
    if (isCommandLine(trimmedLine)) {
        return "command";
    }
    if (isUrlLine(trimmedLine)) {
        return "url";
    }
    return null;
}

function endsWithSentenceBoundary(text) {
    return /[.!?。！？;；:：)](?:["'”’》」』】）\]])*$/.test(String(text || "").trim());
}

function looksLikeOcrText(text) {
    var lines = String(text || "").split("\n");
    var contentLines = lines.filter(function(l) { return l.trim(); });
    if (contentLines.length < 3) {
        return false;
    }
    var continuationPairs = 0;
    for (var i = 0; i < contentLines.length - 1; i++) {
        var current = contentLines[i].trim();
        var next = contentLines[i + 1].trim();
        if (!endsWithSentenceBoundary(current) && /^[a-z(]/.test(next)) {
            continuationPairs++;
        }
    }
    return continuationPairs / (contentLines.length - 1) >= 0.3;
}

function isLikelyListContinuation(previousLine, currentLine) {
    const previousText = normalizeText(stripListMarker(previousLine));
    const currentText = normalizeText(currentLine);

    if (!previousText || !currentText || endsWithSentenceBoundary(previousText)) {
        return false;
    }

    if (/^[a-z0-9(]/.test(currentText)) {
        return true;
    }

    if (/^[,.;:!?)}\]"'"']/.test(currentText)) {
        return true;
    }

    if (/^[^\x00-\x7F]/.test(currentText) && previousText.length >= 18) {
        return true;
    }

    return previousText.length >= 32 && currentText.length <= 32;
}

function buildParagraphs(text, mode) {
    const normalizedText = String(text || "").replace(/\r\n/g, "\n");
    const renderMode = mode === "preserve" ? "format" : mode;
    const lines = normalizedText.split("\n");
    const hasContent = Boolean(normalizeText(normalizedText));

    if (renderMode === "format") {
        return hasContent ? [normalizedText] : [];
    }

    const paragraphs = [];
    let currentParagraph = [];
    let currentStructuredBlock = [];
    let currentStructuredKind = null;
    let inCodeBlock = false;

    function flushParagraph() {
        if (currentParagraph.length > 0) {
            paragraphs.push(currentParagraph.join(" "));
            currentParagraph = [];
        }
    }

    function flushStructuredBlock() {
        if (currentStructuredBlock.length > 0) {
            paragraphs.push(currentStructuredBlock.join("\n"));
            currentStructuredBlock = [];
            currentStructuredKind = null;
        }
    }

    lines.forEach(function(line) {
        const preservedLine = stripTrailingWhitespace(line);
        const trimmedLine = line.trim();

        if (inCodeBlock) {
            currentStructuredBlock.push(preservedLine);
            if (isCodeFenceLine(trimmedLine)) {
                flushStructuredBlock();
                inCodeBlock = false;
            }
            return;
        }

        if (!trimmedLine) {
            flushParagraph();
            flushStructuredBlock();
            return;
        }

        if (isCodeFenceLine(trimmedLine)) {
            flushParagraph();
            flushStructuredBlock();
            currentStructuredKind = "code";
            currentStructuredBlock.push(preservedLine);
            inCodeBlock = true;
            return;
        }

        const structuredKind = getStructuredLineKind(trimmedLine);
        if (structuredKind) {
            flushParagraph();
            if (currentStructuredKind && currentStructuredKind !== structuredKind) {
                flushStructuredBlock();
            }
            currentStructuredKind = structuredKind;
            currentStructuredBlock.push(preservedLine);
            return;
        }

        if (
            currentStructuredKind === "list" &&
            currentStructuredBlock.length > 0 &&
            isLikelyListContinuation(currentStructuredBlock[currentStructuredBlock.length - 1], trimmedLine)
        ) {
            currentStructuredBlock[currentStructuredBlock.length - 1] += " " + trimmedLine;
            return;
        }

        flushStructuredBlock();
        currentParagraph.push(trimmedLine);
    });

    flushParagraph();
    flushStructuredBlock();

    if (paragraphs.length > 0) {
        return paragraphs;
    }

    return hasContent ? [normalizeText(normalizedText)] : [];
}

function resolveCompletion(query, completion) {
    if (query && typeof query.onCompletion === "function") {
        return query.onCompletion;
    }
    return completion;
}

function buildServiceError(type, message, addition) {
    const error = {
        type: type || "api",
        message: message || "Unknown error"
    };
    if (addition) {
        error.addition = addition;
    }
    return error;
}

function getResponseMessage(resp) {
    if (!resp) {
        return "";
    }
    if (resp.data && typeof resp.data === "object" && typeof resp.data.message === "string") {
        return resp.data.message.trim();
    }
    if (typeof resp.data === "string") {
        return resp.data.trim();
    }
    return "";
}

function buildResponseError(resp, url) {
    const statusCode = resp && resp.response ? resp.response.statusCode : 0;
    const responseMessage = getResponseMessage(resp);
    let error;

    if (statusCode === 401) {
        error = buildServiceError("secretKey", responseMessage || "Access denied.");
    } else if (statusCode === 406) {
        error = buildServiceError("unsupportedLanguage", responseMessage || "Unsupported target language.");
    } else if (statusCode === 429) {
        error = buildServiceError("api", responseMessage || "Too many requests.");
    } else if (statusCode >= 500) {
        error = buildServiceError("api", responseMessage || "DeepLX service is unavailable.");
    } else if (statusCode > 0) {
        error = buildServiceError("api", responseMessage || ("Request failed with status " + statusCode + "."));
    } else {
        error = buildServiceError("api", "No response from DeepLX endpoint.");
    }

    error._attemptSummary = "[" + url + "] " + error.message;
    return error;
}

function buildNetworkError(error, url) {
    if (!error) {
        return buildServiceError("api", "Request failed.", "[" + url + "] Request failed.");
    }

    const message = error.message || error.localizedDescription || error._message || "Network request failed.";
    const detail = error.debugMessage || error.localizedFailureReason || error.localizedRecoverySuggestion || "";
    const serviceError = buildServiceError("api", message, detail || undefined);
    serviceError._attemptSummary = "[" + url + "] " + serviceError.message;
    return serviceError;
}

function buildRequestPayload(query) {
    let sourceLang = "";
    if (query.from === "auto") {
        sourceLang = lang.langMap.get(query.detectFrom);
    } else {
        sourceLang = lang.langMap.get(query.from);
    }
    let targetLang = "";
    if (query.to === "auto") {
        targetLang = lang.langMap.get(query.detectTo);
    } else {
        targetLang = lang.langMap.get(query.to);
    }

    return {
        text: query.text,
        source_lang: sourceLang,
        target_lang: targetLang
    };
}

function buildRequestConfig(query) {
    return {
        urls: parseUrls($option.url),
        timeout: parseRequestTimeout($option.timeout),
        headers: buildHeaders($option.token),
        cancelSignal: query ? query.cancelSignal : undefined
    };
}

async function requestTranslation(payload, requestConfig) {
    if (!requestConfig.urls.length) {
        throw buildServiceError("api", "Please configure at least one DeepLX endpoint.");
    }

    const failures = [];
    let lastError = null;

    for (const currentUrl of requestConfig.urls) {
        try {
            const request = {
                method: "POST",
                url: currentUrl,
                header: requestConfig.headers,
                body: payload,
                timeout: requestConfig.timeout
            };

            if (requestConfig.cancelSignal) {
                request.cancelSignal = requestConfig.cancelSignal;
            }

            const resp = await $http.request(request);
            if (resp && resp.error) {
                throw buildNetworkError(resp.error, currentUrl);
            }

            const statusCode = resp && resp.response ? resp.response.statusCode : 0;
            if (statusCode === 200 && resp.data && resp.data.data) {
                return resp;
            }

            const responseError = buildResponseError(resp, currentUrl);
            failures.push(responseError._attemptSummary);
            lastError = responseError;
        } catch (error) {
            const serviceError = error && error._attemptSummary ? error : buildNetworkError(error, currentUrl);
            failures.push(serviceError._attemptSummary);
            lastError = serviceError;
        }
    }

    if (requestConfig.urls.length === 1 && lastError) {
        throw lastError;
    }

    throw buildServiceError(
        "api",
        "All configured DeepLX endpoints failed.",
        failures.join("\n")
    );
}

function buildTranslateResult(query, resp, overrideText) {
    const mainTranslation = (overrideText !== undefined && overrideText !== null)
        ? overrideText
        : resp.data.data;
    const additions = buildAlternatives(resp.data.data, resp.data.alternatives);
    const result = {
        from: resolveDetectedLang(resp.data.source_lang, query.detectFrom),
        to: resolveDetectedLang(resp.data.target_lang, query.detectTo),
        toParagraphs: buildParagraphs(mainTranslation, $option.lineBreakMode)
    };

    if ($option.alternatives == "1" && additions.length > 0) {
        result.toDict = {
            additions: [{
                name: "Alternatives",
                value: additions.join('\n')
            }]
        };
    }

    return result;
}

function translate(query, completion) {
    const done = resolveCompletion(query, completion);
    const requestPayload = buildRequestPayload(query);
    const requestConfig = buildRequestConfig(query);

    (async function() {
        const resp = await requestTranslation(requestPayload, requestConfig);
        let processedText = resp.data.data;
        try {
            processedText = await aiPostEdit(resp.data.data, query);
        } catch (e) {
            // silent fallback: use original DeepLX result
        }
        done({
            result: buildTranslateResult(query, resp, processedText)
        });
    })().catch(function(err) {
        done({
            error: buildServiceError(
                err.type || err._type || "api",
                err.message || err._message || "Unknown error",
                err.addition || err._addition
            )
        });
    });
}

function pluginTimeoutInterval() {
    const base = computePluginTimeout(parseUrls($option.url).length, parseRequestTimeout($option.timeout));
    const aiMode = $option.aiPostProcess;
    const hasAiKey = Boolean(String($option.aiApiKey || "").trim());
    if (aiMode && aiMode !== "off" && hasAiKey) {
        return Math.min(base + DEFAULT_AI_TIMEOUT + 5, MAX_PLUGIN_TIMEOUT);
    }
    return base;
}

function pluginValidate(completion) {
    const requestConfig = buildRequestConfig();
    const payload = {
        text: "Hello world",
        source_lang: lang.langMap.get("en"),
        target_lang: lang.langMap.get("zh-Hans")
    };

    (async function() {
        await requestTranslation(payload, requestConfig);
        completion({
            result: true
        });
    })().catch(function(err) {
        completion({
            result: false,
            error: buildServiceError(
                err.type || err._type || "api",
                err.message || err._message || "Validation failed.",
                err.addition || err._addition
            )
        });
    });
}

exports.supportLanguages = supportLanguages;
exports.translate = translate;
exports.pluginTimeoutInterval = pluginTimeoutInterval;
exports.pluginValidate = pluginValidate;
exports.__test__ = {
    buildAiPrompt: buildAiPrompt,
    buildAlternatives: buildAlternatives,
    buildHeaders: buildHeaders,
    buildParagraphs: buildParagraphs,
    computePluginTimeout: computePluginTimeout,
    endsWithSentenceBoundary: endsWithSentenceBoundary,
    getStructuredLineKind: getStructuredLineKind,
    isCommandLine: isCommandLine,
    isLikelyListContinuation: isLikelyListContinuation,
    isListLine: isListLine,
    isUrlLine: isUrlLine,
    looksLikeOcrText: looksLikeOcrText,
    parseRequestTimeout: parseRequestTimeout,
    parseUrls: parseUrls,
    resolveAiModel: resolveAiModel
};
