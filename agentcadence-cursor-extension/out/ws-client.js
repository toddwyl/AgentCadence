"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WsClient = void 0;
const ws_1 = __importDefault(require("ws"));
class WsClient {
    ws;
    constructor(url, onMessage, onClose) {
        this.ws = new ws_1.default(url);
        this.ws.on('open', () => {
            // Connection established; nothing extra needed.
        });
        this.ws.on('message', (data) => {
            try {
                const parsed = JSON.parse(data.toString());
                onMessage(parsed);
            }
            catch {
                // Ignore non-JSON messages.
            }
        });
        this.ws.on('close', onClose);
        this.ws.on('error', (err) => {
            console.error('[AgentCadence WsClient]', err.message);
            // The 'close' event will fire after an error, triggering onClose.
        });
    }
    send(msg) {
        if (this.ws.readyState === ws_1.default.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    }
    close() {
        this.ws.close();
    }
}
exports.WsClient = WsClient;
//# sourceMappingURL=ws-client.js.map