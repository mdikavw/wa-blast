const {
	default: makeWASocket,
	DisconnectReason,
	fetchLatestBaileysVersion,
	useMultiFileAuthState,
	makeCacheableSignalKeyStore,
} = require('baileys');

const QRCode = require('qrcode');
const P = require('pino');

const logger = P({
	level: 'trace',
	transport: {
		targets: [
			{
				target: 'pino-pretty',
				options: { colorize: true },
				level: 'trace',
			},
			{
				target: 'pino/file',
				options: { destination: './wa-logs.txt' },
				level: 'trace',
			},
		],
	},
});
logger.level = 'trace';

async function startSock({ log, setStatus }) {
	log('Memulai koneksi WhatsApp...');
	const { state, saveCreds } = await useMultiFileAuthState('auth');
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
	});

	sock.ev.on('creds.update', () => {
		log('Mendapatkan kredensial...');
		saveCreds();
	});

	sock.ev.on('connection.update', async update => {
		const { connection, lastDisconnect, qr } = update;

		if (connection === 'connecting') setStatus('menyambungkan');

		if (qr) {
			log('Membuat QR Code');
			const qrImage = await QRCode.toDataURL(qr);

			log({
				type: 'qr',
				data: qrImage,
			});
		}

		if (connection === 'close') {
			log('Koneksi tertutup!');
			setStatus('terputus');
			if (
				lastDisconnect?.error?.output?.statusCode !==
				DisconnectReason.loggedOut
			) {
				log('Memulai ulang...');
				await startSock({ log, setStatus });
			} else {
				log('Koneksi terputus. Harap mulai ulang!');
			}
		} else if (connection === 'open') {
			setStatus('terhubung');
			log('WhatsApp terhubung!');
		}
	});
	return sock;
}

module.exports = startSock;
