# bob-plugin-deeplx

Bob 的 DeepLX 翻译插件，基于 [OwO-Network/DeepLX](https://github.com/OwO-Network/DeepLX)。

这个 fork 在原始插件基础上补了几类实际使用中最容易踩坑的能力：

- 多个 DeepLX 节点自动切换
- 单节点超时控制与设置页校验
- 候选译文去重，并默认关闭 `Alternatives`
- 更适合截图翻译 / OCR 的结果渲染模式
- `Smart Paragraphs` 会合并碎行，但保留列表、代码块、URL、命令行
- `Preserve Formatting` 会尽量保留原始换行和块结构

## 适用场景

- 你已经有可用的 DeepLX 服务
- 你希望在 Bob 中继续使用 DeepL 风格翻译，而不是接入大模型
- 你经常做截图翻译，希望 OCR 断行不要把结果切得很碎
- 你有多个自建节点，想在某个节点挂掉时自动切换到下一个

## 功能概览

### 1. 传统 DeepLX 翻译

插件直接请求 DeepLX 的 `/translate` 接口，不依赖 OpenAI、Claude、Gemini 这类大模型。

这意味着：

- 优点：成本低、速度快、结果稳定
- 限制：不会像大模型那样主动“重写成 Markdown 风格说明文”

插件能做的是“保留格式”和“优化分段”，而不是“二次改写原文结构”。

### 2. 节点容错

`API` 支持填写多个地址，使用英文逗号或换行分隔。插件会按顺序尝试，前一个失败后自动切到下一个。

示例：

```text
http://127.0.0.1:1188/translate
https://deeplx-a.example.com/translate
https://deeplx-b.example.com/translate
```

### 3. 候选译文控制

DeepLX 有时会返回 `alternatives`。短文本和截图翻译场景里，这些候选结果常常长得很像，容易被误以为“插件重复输出”。

这个 fork 的处理是：

- 默认关闭 `Alternatives`
- 即使开启，也会去掉空候选和与主译文重复的内容

### 4. 两种结果渲染模式

#### Smart Paragraphs

适合截图翻译、OCR、网页复制文本。

行为：

- 合并被 OCR 错误拆开的普通正文
- 保留空行分段
- 保留列表块
- 保留围栏代码块
- 保留单独成行的 URL
- 保留命令行块
- 对列表项里的换行续句做智能合并

#### Preserve Formatting

适合以下内容：

- 原文本身排版就很重要
- 列表、说明文、空行结构比较清晰
- 你不希望插件对换行进行任何“智能修正”

这个模式会把 DeepLX 返回的完整文本尽量原样交给 Bob 显示。

## 安装

### 1. 安装 Bob

[![Download on the Mac App Store](https://cdn.ripperhe.com/oss/master/2022/0626/Download_on_the_Mac_App_Store_Badge_US-UK_RGB_blk_092917.svg)](https://apps.apple.com/cn/app/id1630034110#?platform=mac)

### 2. 部署 DeepLX

#### macOS / Homebrew

```bash
brew tap owo-network/brew
brew install deeplx
brew services start owo-network/brew/deeplx
```

更新：

```bash
brew update
brew upgrade deeplx
brew services restart owo-network/brew/deeplx
```

查看版本：

```bash
brew list --versions deeplx
```

#### Linux / 服务器

```bash
bash <(curl -Ls https://qwq.mx/deeplx)
```

更多部署方式请参考 [OwO-Network/DeepLX](https://github.com/OwO-Network/DeepLX)。

### 3. 安装插件

从当前仓库的 Releases 下载 `.bobplugin` 安装包并导入 Bob。

如果你是本地开发，也可以直接打包：

```bash
zip -r -j bob-plugin-deeplx.bobplugin src/*
```

## 配置说明

插件当前配置项如下：

| 选项 | 默认值 | 说明 |
| --- | --- | --- |
| `API` | `http://localhost:1188/translate` | DeepLX 接口地址，支持多个 |
| `Token` | 空 | DeepLX 服务端启用了 Token 时填写 |
| `Timeout` | `8` | 单个接口超时秒数，范围 `3-30` |
| `Alternatives` | `关闭` | 是否显示候选译文 |
| `Render Mode` | `Smart Paragraphs` | 结果分段与格式保留策略 |

### API

如果你用的是本地 Homebrew 默认部署，通常无需修改：

```text
http://localhost:1188/translate
```

如果你是远程服务器：

```text
http://<server-ip>:1188/translate
```

如果你启用了 HTTPS 或反向代理，就填代理后的完整地址。

### Token

如果 DeepLX 服务端设置了访问令牌，就在这里填写。

如果服务端没有启用 Token，保持为空即可。插件不会发送空的 `Authorization` 头。

### Timeout

每个节点的请求超时时间，单位是秒。

建议：

- 局域网 / 本机：`5-8`
- 公网自建节点：`8-15`
- 多节点链式容错：别设太大，否则失败切换会变慢

### Render Mode

推荐：

- 截图翻译 / OCR：`Smart Paragraphs`
- 列表、说明文、原始排版重要的文本：`Preserve Formatting`

## 使用建议

### 场景一：普通文本翻译

推荐配置：

- `Alternatives = 关闭`
- `Render Mode = Preserve Formatting`

### 场景二：截图翻译 / OCR

推荐配置：

- `Alternatives = 关闭`
- `Render Mode = Smart Paragraphs`

### 场景三：多个节点高可用

推荐配置：

- 在 `API` 中填多个节点
- 设置合理的 `Timeout`
- 在 Bob 设置页使用验证按钮先检查配置

## 常见问题

### 为什么截图翻译里会出现多条很像的结果？

通常不是插件重复请求，而是 DeepLX 返回了候选译文 `alternatives`。

这个 fork 已经：

- 默认关闭 `Alternatives`
- 对候选译文去重

如果你不需要候选结果，保持关闭即可。

### Smart Paragraphs 会不会误合并内容？

有可能，但这个 fork 已经尽量把高风险内容排除掉了：

- 列表
- 代码块
- URL
- 命令行
- 列表项续行

如果你更在意原始排版，请切到 `Preserve Formatting`。

### 它能像 Zhipu / OpenAI 那样输出“更像 Markdown”的结果吗？

不能完全等价。

原因很简单：DeepLX 是传统翻译接口，不是大模型。它不会主动把内容重写成更适合阅读的说明文或 Markdown 风格结构。

这个插件能做的是：

- 保留格式
- 优化段落
- 减少 OCR 断行噪声

如果你需要“翻译后顺手重写排版”的效果，本质上还是大模型更适合。

## 开发与验证

本仓库目前提供了最小测试覆盖，主要用于验证纯文本处理逻辑。

语法检查：

```bash
node --check src/main.js
```

运行测试：

```bash
node --test tests/main.test.js
```

## 致谢

- 原始插件作者：[missuo](https://github.com/missuo)
- DeepLX 项目：[OwO-Network/DeepLX](https://github.com/OwO-Network/DeepLX)

## License

[MIT](./LICENSE)
