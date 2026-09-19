import { ZaloApiError } from "../Errors/ZaloApiError.js";
import { ThreadType } from "../models/index.js";
import { apiFactory } from "../utils.js";

export type ForwardMessageReference = {
    id: string;
    ts: number;
    logSrcType: number;
    fwLvl: number;
};

export type ForwardTextPayload = {
    message: string;
    ttl?: number;
    reference?: ForwardMessageReference;
};

/** Forward 1 link kèm preview (thumbnail/title/mô tả) — cùng endpoint `mforward`, msgType "3". */
export type ForwardLinkPayload = {
    link: {
        url: string;
        description?: string;
        thumbnailUrl?: string;
        /** Nguồn gốc link (media source), tuỳ chọn — để trống nếu không có. */
        src?: string;
    };
    ttl?: number;
    reference?: ForwardMessageReference;
};

export type ForwardMessagePayload = ForwardTextPayload | ForwardLinkPayload;

function isForwardLinkPayload(payload: ForwardMessagePayload): payload is ForwardLinkPayload {
    return "link" in payload;
}

/**
 * Người nhận forward — 1 threadId đơn giản (tự sinh `clientId` dùng chung, hành vi cũ), hoặc
 * object có `clientId`/`ttl` riêng để tự map kết quả `success`/`fail` trả về đúng người nhận mà
 * không phụ thuộc giá trị `clientId` do hàm này tự sinh (trước đây LUÔN dùng 1 clientId chung
 * cho mọi người nhận trong 1 lần gọi, khiến caller cần biết chính xác người nào ứng với kết quả
 * nào — vd để lưu lại tin nhắn forward vào đúng hội thoại — không map được).
 */
export type ForwardMessageRecipient = string | { threadId: string; clientId?: string; ttl?: number };

export type ForwardMessageSuccess = {
    clientId: string;
    msgId: string;
};

export type ForwardMessageFail = {
    clientId: string;
    error_code: string;
};

export type ForwardMessageResponse = {
    success: ForwardMessageSuccess[];
    fail: ForwardMessageFail[];
};

export const forwardMessageFactory = apiFactory<ForwardMessageResponse>()((api, ctx, utils) => {
    const serviceURL = {
        [ThreadType.User]: utils.makeURL(`${api.zpwServiceMap.file[0]}/api/message/mforward`),
        [ThreadType.Group]: utils.makeURL(`${api.zpwServiceMap.file[0]}/api/group/mforward`),
    };

    /**
     * Forward message (text hoặc link) to multiple threads
     *
     * @param payload Forward message payload — text (`{message}`) hoặc link (`{link}`)
     * @param recipients Danh sách người nhận — string (threadId) hoặc `{threadId,clientId?,ttl?}`
     *  để tự kiểm soát `clientId`/`ttl` riêng từng người, phục vụ map kết quả trả về chính xác.
     * @param type Thread type (User/Group)
     *
     * @throws {ZaloApiError}
     */
    return async function forwardMessage(
        payload: ForwardMessagePayload,
        recipients: ForwardMessageRecipient[],
        type: ThreadType = ThreadType.User,
    ) {
        const isLink = isForwardLinkPayload(payload);
        if (!isLink && !payload.message) throw new ZaloApiError("Missing message content");
        if (isLink && !payload.link?.url) throw new ZaloApiError("Missing link url");
        if (!recipients || recipients.length === 0) throw new ZaloApiError("Missing thread IDs");

        const defaultClientId = Date.now().toString();
        const normalizedRecipients = recipients.map((recipient) =>
            typeof recipient === "string"
                ? { threadId: recipient, clientId: defaultClientId, ttl: payload.ttl ?? 0 }
                : { threadId: recipient.threadId, clientId: recipient.clientId ?? defaultClientId, ttl: recipient.ttl ?? payload.ttl ?? 0 },
        );

        const msgInfo = isLink
            ? {
                  link: payload.link.url,
                  linkTitle: payload.link.url,
                  linkDesc: payload.link.description ?? "",
                  linkThumb: payload.link.thumbnailUrl ?? "",
                  linkType: "",
                  extData: JSON.stringify({
                      streamUrl: "",
                      stream_icon: "",
                      mediaTitle: "",
                      artist: "",
                      src: payload.link.src ?? "",
                      count: "",
                      type: 0,
                  }),
                  message: payload.link.url,
                  reference: payload.reference
                      ? JSON.stringify({
                            type: 3,
                            data: JSON.stringify(payload.reference),
                        })
                      : undefined,
              }
            : {
                  message: payload.message,
                  reference: payload.reference
                      ? JSON.stringify({
                            type: 3,
                            data: JSON.stringify(payload.reference),
                        })
                      : undefined,
              };

        const decorLog = payload.reference
            ? {
                  fw: {
                      pmsg: {
                          st: 1,
                          ts: payload.reference.ts,
                          id: payload.reference.id,
                      },
                      rmsg: {
                          st: 1,
                          ts: payload.reference.ts,
                          id: payload.reference.id,
                      },
                      fwLvl: payload.reference.fwLvl,
                  },
              }
            : null;

        const msgType = isLink ? "3" : "1";

        let params;
        if (type === ThreadType.User) {
            params = {
                toIds: normalizedRecipients.map(({ threadId, clientId, ttl }) => ({
                    clientId,
                    toUid: threadId,
                    ttl,
                })),
                imei: ctx.imei,
                ttl: payload.ttl ?? 0,
                msgType,
                totalIds: normalizedRecipients.length,
                msgInfo: JSON.stringify(msgInfo),
                decorLog: JSON.stringify(decorLog),
            };
        } else {
            params = {
                grids: normalizedRecipients.map(({ threadId, clientId, ttl }) => ({
                    clientId,
                    grid: threadId,
                    ttl,
                })),
                ttl: payload.ttl ?? 0,
                msgType,
                totalIds: normalizedRecipients.length,
                msgInfo: JSON.stringify(msgInfo),
                decorLog: JSON.stringify(decorLog),
            };
        }

        const encryptedParams = utils.encodeAES(JSON.stringify(params));
        if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");

        const response = await utils.request(serviceURL[type], {
            method: "POST",
            body: new URLSearchParams({
                params: encryptedParams,
            }),
        });

        return utils.resolve(response);
    };
});
