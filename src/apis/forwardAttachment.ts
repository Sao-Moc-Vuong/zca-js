import { ZaloApiError } from "../Errors/ZaloApiError.js";
import { ThreadType } from "../models/index.js";
import { apiFactory, getFileExtension, getFileName, getMd5LargeFileObject } from "../utils.js";

export enum ForwardAttachmentType {
    IMAGE = "image",
    FILE = "file",
}

export type ForwardImageAttachmentOptions = {
    /** URL của ảnh đã có sẵn trên Zalo CDN (vd lấy từ 1 tin nhắn/attachment khác) — KHÔNG upload lại. */
    url: string;
    msg?: string;
};

export type ForwardFileAttachmentOptions = {
    url: string;
    /** Tên file hiển thị — mặc định lấy từ URL nếu không truyền. */
    fileName?: string;
    msg?: string;
};

export type ForwardAttachmentOptions<T extends ForwardAttachmentType> = T extends ForwardAttachmentType.IMAGE
    ? ForwardImageAttachmentOptions
    : T extends ForwardAttachmentType.FILE
      ? ForwardFileAttachmentOptions
      : never;

export type ForwardAttachmentResponse = {
    msgId: number;
};

/**
 * Forward 1 attachment (ảnh/file) ĐÃ CÓ SẴN trên Zalo CDN sang thread khác, KHÔNG upload lại từ
 * đầu — dùng endpoint riêng `/api/{message,group}/forward` (khác `sendMessage`/`uploadAttachment`
 * vốn dùng để upload MỚI). zca-js không có API này sẵn — tự dựng dựa trên phân tích giao thức
 * (không copy code từ thư viện khác): tải nội dung URL về để tính checksum/size (Zalo yêu cầu
 * các field này trong request dù không re-upload bytes), rồi gửi request chỉ THAM CHIẾU url gốc.
 */
export const forwardAttachmentFactory = apiFactory<ForwardAttachmentResponse>()((api, ctx, utils) => {
    const serviceURL = {
        [ThreadType.User]: utils.makeURL(`${api.zpwServiceMap.file[0]}/api/message/forward`),
        [ThreadType.Group]: utils.makeURL(`${api.zpwServiceMap.file[0]}/api/group/forward`),
    };

    return async function forwardAttachment<T extends ForwardAttachmentType>(
        options: ForwardAttachmentOptions<T>,
        threadId: string,
        type: ThreadType = ThreadType.User,
        messageType: T,
    ) {
        if (!options.url) throw new ZaloApiError("Missing attachment url");

        const downloadResponse = await fetch(options.url);
        if (!downloadResponse.ok) throw new ZaloApiError(`Failed to fetch attachment url (status ${downloadResponse.status})`);
        const buffer = Buffer.from(await downloadResponse.arrayBuffer());
        const fileSize = buffer.byteLength;
        const checksum = await getMd5LargeFileObject({ data: buffer, filename: "forward.bin", metadata: { totalSize: fileSize } }, fileSize);

        const timestamp = Date.now();

        let msgInfo: Record<string, unknown> = {
            reference: JSON.stringify({
                type: 3,
                data: JSON.stringify({
                    ts: timestamp,
                    logSrcType: 1,
                    fwLvl: 1,
                    rootMsgRef: {
                        ts: timestamp,
                        logSrcType: 1,
                    },
                }),
            }),
        };

        let params: Record<string, unknown> = {
            clientId: String(timestamp),
            ttl: 0,
            zsource: 703,
            imei: ctx.imei,
            decorLog: JSON.stringify({
                fw: {
                    pmsg: { st: 1, ts: timestamp },
                    rmsg: { st: 1, ts: timestamp },
                    fwLvl: 1,
                },
            }),
        };

        if (messageType === ForwardAttachmentType.IMAGE) {
            const imageOptions = options as ForwardImageAttachmentOptions;
            // width/height cố định — Zalo server tự đọc lại kích thước thật từ ảnh gốc trên CDN
            // (không re-upload bytes nên không có ảnh thật để tự đo), zalo-toolkit dùng đúng cách
            // này (giá trị placeholder, không ảnh hưởng hiển thị thật phía người nhận).
            msgInfo = {
                ...msgInfo,
                title: "",
                oriUrl: imageOptions.url,
                url: imageOptions.url,
                thumbUrl: imageOptions.url,
                width: 720,
                height: 1280,
                properties: null,
                hdSize: fileSize,
                normalUrl: "",
            };
            params = { ...params, msgType: 2, jcp: { convertible: "jxl" } };
        } else if (messageType === ForwardAttachmentType.FILE) {
            const fileOptions = options as ForwardFileAttachmentOptions;
            msgInfo = {
                ...msgInfo,
                url: fileOptions.url,
                size: fileSize,
                checksum: checksum.data,
                extension: getFileExtension(fileOptions.url) || "",
                fileName: fileOptions.fileName || getFileName(fileOptions.url),
                title: fileOptions.msg,
            };
            params = { ...params, msgType: 1 };
        } else {
            throw new ZaloApiError(`Unsupported messageType: ${messageType}`);
        }

        if (type === ThreadType.User) {
            params.toId = threadId;
        } else if (type === ThreadType.Group) {
            params.grid = threadId;
        }

        params.msgInfo = JSON.stringify(msgInfo);

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
