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

function translate(query, completion) {
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

    const body = JSON.stringify({
        text: query.text,
        source_lang: sourceLang,
        target_lang: targetLang,
    });
    console.log(body);

    (async () => {
        const urls = $option.url.split(",");
        const randomUrl = urls[Math.floor(Math.random() * urls.length)];
        const accessToken = $option.token;
        const resp = await $http.request({
            method: "POST",
            url: randomUrl,
            header: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + accessToken
            },
            body: $data.fromUTF8(body)
        });
        const {
            statusCode
        } = resp.response;
        if (statusCode === 200 && resp.data.data){
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

            completion({
                result: result,
            });
        }else if (statusCode === 406) {
            completion({
                error: {
                    type: "unsupportedLanguage",
                    message: "Unsupported target languages",
                },
            });
            return;
        } else if (statusCode === 429) {
            completion({
                error: {
                    type: "api",
                    message: "Too many requests",
                },
            });
            return;
        } else if (statusCode === 401){
            completion({
                error: {
                    type: "secretKey",
                    message: "Access denied",
                },
            });
            return;
        }
    })().catch(err => {
        completion({
            error: {
                type: err._type || "unknown",
                message: err._message || "Unknown error",
                addition: err._addition,
            },
        });
    });
}

exports.supportLanguages = supportLanguages;
exports.translate = translate;
exports.__test__ = {
    buildAlternatives: buildAlternatives
};
