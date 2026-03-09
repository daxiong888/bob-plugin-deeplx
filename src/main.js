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

function buildTranslateResult(query, resp) {
    const mainTranslation = resp.data.data;
    const additions = buildAlternatives(mainTranslation, resp.data.alternatives);
    const result = {
        from: resolveDetectedLang(resp.data.source_lang, query.detectFrom),
        to: resolveDetectedLang(resp.data.target_lang, query.detectTo),
        toParagraphs: mainTranslation.split('\n')
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
        done({
            result: buildTranslateResult(query, resp)
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
    return computePluginTimeout(parseUrls($option.url).length, parseRequestTimeout($option.timeout));
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
    buildAlternatives: buildAlternatives,
    buildHeaders: buildHeaders,
    computePluginTimeout: computePluginTimeout,
    parseRequestTimeout: parseRequestTimeout,
    parseUrls: parseUrls
};
