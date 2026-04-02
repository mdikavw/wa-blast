"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = startSock;
const baileys_1 = __importStar(require("baileys"));
const qrcode_terminal_1 = __importDefault(require("qrcode-terminal"));
async function startSock(log) {
    log('Memulai koneksi WhatsApp...');
    const { state, saveCreds } = await (0, baileys_1.useMultiFileAuthState)('auth');
    const { version } = await (0, baileys_1.fetchLatestBaileysVersion)();
    const sock = (0, baileys_1.default)({
        version,
        auth: state,
    });
    sock.ev.on('creds.update', () => {
        log('Mendapatkan kredensial...');
        saveCreds();
    });
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            log('Membuat QR Code');
            qrcode_terminal_1.default.generate(qr, { small: true });
        }
        if (connection === 'close') {
            log('Koneksi tertutup!');
            if (lastDisconnect?.error?.output?.statusCode !==
                baileys_1.DisconnectReason.loggedOut) {
                log('Memulai ulang...');
                startSock(log);
            }
            else {
                log('Koneksi terputus. Harap mulai ulang!');
            }
        }
        else if (connection === 'open') {
            log('WhatsApp terhubung!');
        }
    });
}
