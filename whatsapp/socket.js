const {
    default: makeWASocket,
    DisconnectReason,
    fetchLatestBaileysVersion,
    useMultiFileAuthState,
    makeCacheableSignalKeyStore,
} = require('baileys');

const QRCode = require('qrcode');
const P = require('pino');
const path = require('path');
const { app } = require('electron'); 

const userDataPath = app.getPath('userData');
const authFolder = path.join(userDataPath, 'wa_auth_session'); 
const logFilePath = path.join(userDataPath, 'wa-logs.txt');   

const transportTargets = [
    {
        target: 'pino/file',
        options: { destination: logFilePath },
        level: 'trace',
    },
];

let shouldReconnect = true;

if (!app.isPackaged) {
    transportTargets.unshift({
        target: 'pino-pretty',
        options: { colorize: true },
        level: 'trace',
    });
}

const logger = P({
    level: 'trace',
    transport: {
        targets: transportTargets,
    },
});

async function startSock({ log, setStatus, updateButton }) {
    log('Memulai koneksi WhatsApp...');
    const { state, saveCreds } = await useMultiFileAuthState(authFolder);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        shouldSyncHistoryMessage: () => false,
        keepAliveIntervalMs: 20000,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        retryRequestDelayMs: 5000,
        browser: ['MacOS', 'Chrome', '1.0.0']
    });

	sock.ev.on('creds.update', async () => {
		log('Menyimpan kredensial sesi...');
		await saveCreds();
	});

    sock.ev.on('connection.update', async update => {
        const { connection, lastDisconnect, qr } = update;

        if (connection === 'connecting') setStatus('menyambungkan');

        if (qr) {
            log('Membuat QR Code...');
            const qrImage = await QRCode.toDataURL(qr);

            log({
                type: 'qr',
                data: qrImage,
            });
        }

		if (connection === 'open') {
			log('Berhasil terhubung ke WhatsApp!');
			setStatus('terhubung');
		}

        if (connection === 'close') {
			log('Koneksi tertutup!');
			setStatus('terputus');

			if (
				shouldReconnect &&
				lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
			) {
				log('Reconnect otomatis...');

				setTimeout(() => {
					startSock({ log, setStatus, updateButton });
				}, 3000);
			}
		}
			});
    
    return sock;
}

function setReconnect(value) {
    shouldReconnect = value;
}

module.exports = { startSock, setReconnect };
