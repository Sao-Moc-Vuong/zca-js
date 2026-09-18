import { ZaloApiError } from "./ZaloApiError.js";

export class ZaloApiLoginQRExpired extends ZaloApiError {
    constructor(message: string = "Login QR code expired") {
        super(message);
        this.name = "ZaloApiLoginQRExpired";
    }
}
