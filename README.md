# ZCA-JS

> [!NOTE]
> This is an unofficial Zalo API for personal account. It work by simulating the browser to interact with Zalo Web.

> [!WARNING]
> Using this API could get your account locked or banned. We are not responsible for any issues that may happen. Use it at your own risk.

> [!NOTE]
> This is `@smvsoftware/zca-js`, a fork of [RFS-ADRENO/zca-js](https://github.com/RFS-ADRENO/zca-js) — see [Fork Changes](#fork-changes) for what's different from upstream.

---

## Table of Contents

-   [Installation](#installation)
    -   [Migrate to V2](#migrate-to-v2)
-   [Fork Changes](#fork-changes)
-   [Documentation](#documentation)
-   [Basic Usages](#basic-usages)
    -   [Login](#login)
    -   [Listen for new messages](#listen-for-new-messages)
    -   [Send a message](#send-a-message)
    -   [Get/Send a sticker](#getsend-a-sticker)
-   [Example](#example)
-   [Projects & Useful Resources](#projects--useful-resources)
-   [Contributing](#contributing)
-   [License](#license)
-   [Support Us](#support-us)

## Installation

```bash
bun add @smvsoftware/zca-js # or npm install @smvsoftware/zca-js
```

### Migrate to V2

Since official version 2.0.0, `zca-js` has removed sharp dependency for image metadata extraction. It now requires users to provide their own `imageMetadataGetter` function when initializing the `Zalo` class if they want to send images/gifs by file path.

Example of custom `imageMetadataGetter` using `sharp`:

```bash
bun add sharp # or npm install sharp
```

```javascript
import { Zalo } from "@smvsoftware/zca-js";
import sharp from "sharp";
import fs from "node:fs";

async function imageMetadataGetter(filePath) {
    const data = await fs.promises.readFile(filePath);
    const metadata = await sharp(data).metadata();
    return {
        height: metadata.height,
        width: metadata.width,
        size: metadata.size || data.length,
    };
}

const zalo = new Zalo({
    imageMetadataGetter,
});
```

---

## Fork Changes

This fork adds bug fixes and features on top of upstream `zca-js@2.2.0`, published as `@smvsoftware/zca-js`.

### Bug fixes

-   **`getGroupMembersInfo` HTTP 431** — upstream sends the encrypted params as a GET query string instead of POST body (unlike `getGroupInfo`, which already uses POST). Large member batches exceed the URL/header length limit and fail with `431 Request Header Fields Too Large`. Fixed to POST+body, matching `getGroupInfo`. ([src/apis/getGroupMembersInfo.ts](src/apis/getGroupMembersInfo.ts))
-   **Recalled messages not detected in offline history** — `requestOldMessages` (the `old_messages` event, cmd 510/511) didn't check `content.deleteMsg`, so a recalled message pulled from history showed up as a normal text message instead of emitting an `undo` event, unlike the realtime path (cmd 501/521) which already handled this correctly. Fixed to emit `undo` consistently for both paths. ([src/apis/listen.ts](src/apis/listen.ts))
-   **`loginQR()` promise never settles with a callback** — when a `callback` is passed to `loginQR()`, the returned promise never resolves/rejects on `QRCodeExpired` or `QRCodeDeclined`, only the callback fires — callers awaiting the promise hang forever. Fixed to also reject the promise (`ZaloApiLoginQRExpired`/`ZaloApiLoginQRDeclined`) in both cases. ([src/apis/loginQR.ts](src/apis/loginQR.ts))

### New features

-   **`forwardMessage` per-recipient `clientId`/`ttl`** — upstream generates a single shared `clientId` for every recipient in a batch forward, making it impossible for callers to map each forwarded message back to its recipient. `recipients` now accepts `{ threadId, clientId?, ttl? }[]` (still accepts a plain `string[]` for backward compatibility). ([src/apis/forwardMessage.ts](src/apis/forwardMessage.ts))
-   **`forwardMessage` LINK payload** — in addition to the existing text payload (`{ message }`), `forwardMessage` now also accepts a link payload (`{ link: { url, description?, thumbnailUrl?, src? } }`). ([src/apis/forwardMessage.ts](src/apis/forwardMessage.ts))
-   **`forwardAttachment`** — new API to forward an already-uploaded image/file attachment (by URL reference) to another thread without re-uploading it. Upstream has no equivalent. ([src/apis/forwardAttachment.ts](src/apis/forwardAttachment.ts))

---

## Documentation

See [API Documentation](https://zca-js.tdung.com) for more details.

---

## Basic Usages

### Login

```javascript
import { Zalo } from "@smvsoftware/zca-js";

const zalo = new Zalo();
const api = await zalo.loginQR();
```

### Listen for new messages

```javascript
import { Zalo, ThreadType } from "@smvsoftware/zca-js";

const zalo = new Zalo();
const api = await zalo.loginQR();

api.listener.on("message", (message) => {
    const isPlainText = typeof message.data.content === "string";

    switch (message.type) {
        case ThreadType.User: {
            if (isPlainText) {
                // received plain text direct message
            }
            break;
        }
        case ThreadType.Group: {
            if (isPlainText) {
                // received plain text group message
            }
            break;
        }
    }
});

api.listener.start();
```

> [!IMPORTANT]
> Only one web listener can run per account at a time. If you open Zalo in the browser while the listener is active, the listener will be automatically stopped.

### Send a message

```javascript
import { Zalo, ThreadType } from "@smvsoftware/zca-js";

const zalo = new Zalo();
const api = await zalo.loginQR();

// Echo bot
api.listener.on("message", (message) => {
    const isPlainText = typeof message.data.content === "string";
    if (message.isSelf || !isPlainText) return;

    switch (message.type) {
        case ThreadType.User: {
            api.sendMessage(
                {
                    msg: "echo: " + message.data.content,
                    quote: message.data, // the message to reply to (optional)
                },
                message.threadId,
                message.type, // ThreadType.User
            );
            break;
        }
        case ThreadType.Group: {
            api.sendMessage(
                {
                    msg: "echo: " + message.data.content,
                    quote: message.data, // the message to reply to (optional)
                },
                message.threadId,
                message.type, // ThreadType.Group
            );
            break;
        }
    }
});

api.listener.start();
```

### Get/Send a sticker

```javascript
api.getStickers("hello").then(async (stickerIds) => {
    // Get the first sticker
    const stickerObject = await api.getStickersDetail(stickerIds[0]);
    api.sendMessageSticker(
        stickerObject,
        message.threadId,
        message.type, // ThreadType.User or ThreadType.Group
    );
});
```

---

## Example

See [examples](examples) folder for more details.

---

## Projects & Useful Resources

<div align="center">

| Repository                                                                  | Description                                                                                                                                     |
| :-------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------- |
| [**ZaloDataExtractor**](https://github.com/JustKemForFun/ZaloDataExtractor) | A browser `Extension` to extract IMEI, cookies, and user agent from Zalo Web.                                                                   |
| [**MultiZlogin**](https://github.com/ChickenAI/multizlogin)                 | A multi-account Zalo management system that lets you log in to and manage multiple accounts simultaneously, with proxy and webhook integration. |
| [**n8n-nodes-zalo-tools**](https://github.com/ChickenAI/zalo-node)          | N8N node for personal Zalo account.                                                                                                             |
| [**Zalo-F12**](https://github.com/ElectroHeavenVN/Zalo-F12)                 | A collection of JavaScript code snippets to paste into DevTools to change how Zalo Web/PC works.                                                |
| [**Zalo-F12-Tools**](https://github.com/JustKemForFun/Zalo-F12-Tools)       | Toggle hidden modes for Zalo Web.                                                                                                               |

</div>

---

## Contributing

We welcome contributions from the community! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details on how to:

-   🐛 Report bugs and issues
-   ✨ Suggest new features
-   🔧 Submit code contributions
-   📚 Improve documentation
-   🧪 Add or improve tests
-   🔒 Report security vulnerabilities

For more information, please read our [Code of Conduct](CODE_OF_CONDUCT.md) and [Security Policy](SECURITY.md) before participating.

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## **Support Us**

-   ⭐ **Star our repositories** if you find them useful!
-   🔄 **Share** with your network to help us grow
-   💡 **Contribute** your ideas and code
-   ☕ **A coffee**:
    -   [Buy Me a Coffee](https://ko-fi.com/grosse)
    -   [Paypal](https://www.paypal.com/paypalme/dungto213)
    -   [VietQR](https://github.com/user-attachments/assets/e1f319d6-9d11-4082-8248-55b55e645caa)
    -   [Momo](https://me.momo.vn/gMIMulsaUqsbf6iAiXt3)
