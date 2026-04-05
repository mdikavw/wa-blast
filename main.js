const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { useMultiFileAuthState } = require('baileys');
const { startSock, setReconnect } = require('./whatsapp/socket.js');
const fs = require('fs');

const userDataPath = app.getPath('userData');
const authFolder = path.join(userDataPath, 'baileys_auth');
const contactPath = path.join(userDataPath, 'contact.json');
const variablesPath = path.join(userDataPath, 'variables.json');
function ensureFile(filePath, defaultData) {
	if (!fs.existsSync(filePath)) {
		fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
	}
}

ensureFile(contactPath, {});
ensureFile(variablesPath, {
	columns: [],
	message: 'Halo {sapaan} {nama}',
	scheduleTime: '14:00',
});

let win;
let sock;
let connected;
const contacts = getContacts();
let schedulerTimer = null;
let currentScheduleTime = '14:20';

const batchDir = path.join(userDataPath, 'data', 'batches');
if (!fs.existsSync(batchDir)) {
	fs.mkdirSync(batchDir, { recursive: true });
}

function getToday() {
	return new Date().toISOString().split('T')[0];
}

function getContacts() {
	if (!fs.existsSync(contactPath)) return {};

	return JSON.parse(fs.readFileSync(contactPath));
}

function normalizeNumber(num) {
	num = num.trim().replace(/\s+/g, '');

	if (num.startsWith('+')) num = num.slice(1);
	if (num.startsWith('0')) num = '62' + num.slice(1);

	if (!/^628\d{7,13}$/.test(num)) {
		throw new Error(`Nomor tidak valid: ${num}`);
	}

	return num;
}

ipcMain.handle('check-batch', () => {
	const file = path.join(batchDir, `${getToday()}.json`);
	return fs.existsSync(file);
});

ipcMain.handle('save-batch', (_, csvString) => {
	const file = path.join(batchDir, `${getToday()}.json`);
	const variables = JSON.parse(fs.readFileSync(variablesPath));
	const dynamicCols = variables.columns || [];

	const contacts = getContacts();

	// 🔥 BUILD MAP nomor → data
	const contactMap = {};
	Object.entries(contacts).forEach(([nama, data]) => {
		const nomor = normalizeNumber(data.number);
		contactMap[nomor] = {
			nama,
			nomor,
			sapaan: data.sapaan,
		};
	});

	// 🔥 AMBIL DATA LAMA (kalau ada)
	let existing = {};
	if (fs.existsSync(file)) {
		const parsed = JSON.parse(fs.readFileSync(file));
		parsed.forEach(item => {
			existing[item.nomor] = item;
		});
	}

	// 🔥 PARSE CSV
	const lines = csvString
		.split(/\r?\n/)
		.map(l => l.trim())
		.filter(l => l.length);

	if (lines.length === 0) {
		throw new Error('CSV kosong');
	}

	const headers = lines[0].split(',').map(h => h.trim());

	if (!headers.includes('nomor')) {
		throw new Error('CSV harus punya kolom: nomor');
	}

	dynamicCols.forEach(col => {
		if (!headers.includes(col)) {
			console.warn(`Kolom ${col} tidak ditemukan di CSV, default '-'`);
		}
	});

	const resultMap = {};

	// 1. isi dari existing + default "-"
	Object.values(contactMap).forEach(contact => {
		const base = {
			...contact,
		};

		dynamicCols.forEach(col => {
			base[col] = existing[contact.nomor]?.[col] ?? '-';
		});

		resultMap[contact.nomor] = base;
	});

	// 2. overwrite dari CSV
	for (let i = 1; i < lines.length; i++) {
		const values = lines[i].split(',');

		const obj = {};
		headers.forEach((h, j) => {
			obj[h] = values[j]?.trim();
		});

		if (!obj.nomor) continue;

		const nomor = normalizeNumber(obj.nomor);
		const contact = contactMap[nomor];

		if (!contact) {
			throw new Error(`Nomor ${nomor} tidak ditemukan`);
		}

		const newData = {
			...contact,
		};

		dynamicCols.forEach(col => {
			newData[col] = obj[col] || '-';
		});

		resultMap[nomor] = newData;
	}

	// 3. simpan
	const result = Object.values(resultMap);
	fs.writeFileSync(file, JSON.stringify(result, null, 2));

	return true;
});

ipcMain.handle('get-batch', () => {
	const file = path.join(batchDir, `${getToday()}.json`);

	if (!fs.existsSync(file)) return [];

	return JSON.parse(fs.readFileSync(file));
});

function getDynamicCols() {
	if (!fs.existsSync(variablesPath)) return [];
	const variables = JSON.parse(fs.readFileSync(variablesPath));
	return variables.columns || [];
}

function getTemplate() {
	if (!fs.existsSync(variablesPath)) return '';
	const variables = JSON.parse(fs.readFileSync(variablesPath));
	return variables.message || 'Halo, pesan ini dikirim oleh WhatsappBlast!';
}

ipcMain.handle('start-scheduler', () => {
	console.log('Start scheduler dari batch');

	const file = path.join(batchDir, `${getToday()}.json`);

	if (!fs.existsSync(file)) {
		throw new Error('Batch belum ada');
	}

	const batch = JSON.parse(fs.readFileSync(file));

	// kalau belum ada jadwal → generate
	const belumAdaJadwal = batch.every(i => !i.jadwal);

	if (belumAdaJadwal) {
		generateSchedule(currentScheduleTime);
	}

	reassignMissedSchedules();
	scheduleNext();

	return JSON.parse(fs.readFileSync(file));
});

function generateSchedule(startTime = currentScheduleTime) {
	console.log(`Membuat jadwal mulai pukul: ${startTime}`);
	const dynamicCols = getDynamicCols();
	const [hour, minute] = startTime.split(':').map(Number);
	const start = new Date();
	start.setHours(hour, minute, 0, 0);

	let currentTime = start.getTime();

	const minInterval = 60 * 1000;
	const maxInterval = 5 * 60 * 1000;

	const file = path.join(batchDir, `${getToday()}.json`);
	const batch = JSON.parse(fs.readFileSync(file));
	const updated = batch.map(row => {
		const hasValue = dynamicCols.some(col => {
			const val = Number(row[col]);
			return Number.isFinite(val) && val > 0;
		});

		// ❌ skip kirim
		if (!hasValue) {
			return {
				...row,
				jadwal: null,
				status: 'skip',
			};
		}

		// ✅ normal schedule
		const item = {
			...row,
			jadwal: new Date(currentTime).toISOString(),
			status: 'menunggu',
		};

		const randomInterval =
			Math.random() * (maxInterval - minInterval) + minInterval;

		currentTime += randomInterval;

		return item;
	});

	fs.writeFileSync(file, JSON.stringify(updated, null, 2));
	return updated;
}

function reassignMissedSchedules() {
	const file = path.join(batchDir, `${getToday()}.json`);
	if (!fs.existsSync(file)) return;

	const batch = JSON.parse(fs.readFileSync(file));

	const pending = batch
		.filter(i => i.status === 'menunggu')
		.sort((a, b) => new Date(a.jadwal) - new Date(b.jadwal));

	if (!pending.length) return;

	const now = Date.now();

	if (new Date(pending[0].jadwal).getTime() > now) return;

	let currentTime = now;

	const minInterval = 60 * 1000;
	const maxInterval = 5 * 60 * 1000;

	for (const item of pending) {
		item.jadwal = new Date(currentTime).toISOString();

		const randomInterval =
			Math.random() * (maxInterval - minInterval) + minInterval;

		currentTime += randomInterval;
	}

	fs.writeFileSync(file, JSON.stringify(batch, null, 2));
}

function getNextPending() {
	const file = path.join(batchDir, `${getToday()}.json`);
	if (!fs.existsSync(file)) return null;

	const batch = JSON.parse(fs.readFileSync(file));

	let next = null;

	for (const item of batch) {
		if (item.status !== 'menunggu') continue;

		if (!next || new Date(item.jadwal) < new Date(next.jadwal)) {
			next = item;
		}
	}

	return next;
}

function scheduleNext() {
	if (schedulerTimer) {
		clearTimeout(schedulerTimer);
		schedulerTimer = null;
	}

	const file = path.join(batchDir, `${getToday()}.json`);
	if (!fs.existsSync(file)) return;

	const batch = JSON.parse(fs.readFileSync(file));

	const next = batch
		.filter(i => i.status === 'menunggu')
		.sort((a, b) => new Date(a.jadwal) - new Date(b.jadwal))[0];

	if (!next) {
		console.log('Semua pesan selesai');
		return;
	}

	const delay = Math.max(0, new Date(next.jadwal) - Date.now());

	schedulerTimer = setTimeout(async () => {
		try {
			next.status = 'mengirim';
			fs.writeFileSync(file, JSON.stringify(batch, null, 2));

			await sendWhatAppMessage(next);

			next.status = 'terkirim';
			next.terkirim = new Date().toISOString();
		} catch (err) {
			next.status = 'gagal';
		}

		fs.writeFileSync(file, JSON.stringify(batch, null, 2));

		scheduleNext();
	}, delay);
}

function getTodayBatch() {
	const file = path.join(batchDir, `${getToday()}.json`);

	if (!fs.existsSync(file)) {
		throw new Error('Batch hari ini belum ada');
	}

	return JSON.parse(fs.readFileSync(file));
}

async function sendWhatAppMessage(row) {
	if (!sock?.user) {
		throw new Error('WhatsApp belum siap');
	}

	// ✅ ambil dari row
	const { nomor, nama } = row;

	if (!nomor || !nama) {
		throw new Error('Data tidak lengkap (nomor/nama)');
	}

	const jid = nomor + '@s.whatsapp.net';

	const contact = getContacts()[nama] || {};
	const sapaan = contact.sapaan || '';

	const variablesData = {
		...row, // semua kolom dari CSV / batch
		sapaan, // tambahan dari contact
	};

	let message = getTemplate();

	Object.entries(variablesData).forEach(([key, value]) => {
		const safeValue = value ?? '-';
		message = message.replace(new RegExp(`{${key}}`, 'g'), safeValue);
	});

	// console.log(`Mengirim ke ${sapaan} ${nama}`);
	// console.log('Pesan:', message);

	await sock.presenceSubscribe(jid);
	await sock.sendPresenceUpdate('composing', jid);

	await new Promise(r => setTimeout(r, 1500));

	await sock.sendMessage(jid, { text: message });

	await sock.sendPresenceUpdate('paused', jid);
}

function log(message) {
	if (win) {
		win.webContents.send('log', message);
	}
}

function setStatus(status) {
	if (win) {
		win.webContents.send('status', status);
	}
}

function updateButton(label) {
	if (win) {
		win.webContents.send('update-button', label);
	}
}

function sendStatusUpdate() {
	const file = path.join(batchDir, `${getToday()}.json`);
	if (!fs.existsSync(file)) return;

	const batch = JSON.parse(fs.readFileSync(file));
	win.webContents.send('status-data', batch);
}

ipcMain.on('navigate', (event, page) => {
	if (win) {
		win.loadFile(path.join(__dirname, page));
	}
});

if (fs.existsSync(variablesPath)) {
	const vars = JSON.parse(fs.readFileSync(variablesPath));
	if (vars.scheduleTime) {
		currentScheduleTime = vars.scheduleTime;
	}
}

ipcMain.handle('get-variables', () => {
	if (!fs.existsSync(variablesPath)) return {};
	return JSON.parse(fs.readFileSync(variablesPath));
});

ipcMain.handle('save-variables', (_, data) => {
    const userDataPath = app.getPath('userData');
    const variablesPath = path.join(userDataPath, 'variables.json');

    try {
        let currentVars = {};
        if (fs.existsSync(variablesPath)) {
            const fileContent = fs.readFileSync(variablesPath, 'utf8');
            if (fileContent) {
                currentVars = JSON.parse(fileContent);
            }
        }
        const updatedVars = { ...currentVars, ...data };

        fs.writeFileSync(variablesPath, JSON.stringify(updatedVars, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('Gagal menyimpan variabel:', error);
        return false;
    }
});

ipcMain.handle('get-schedule-time', () => {
	return currentScheduleTime;
});

ipcMain.handle('set-schedule-time', (_, newTime) => {
	currentScheduleTime = newTime;

	let currentVars = {};
	if (fs.existsSync(variablesPath)) {
		currentVars = JSON.parse(fs.readFileSync(variablesPath));
	}

	currentVars.scheduleTime = newTime;

	fs.writeFileSync(variablesPath, JSON.stringify(currentVars, null, 2));

	return true;
});

function createWindow() {
	win = new BrowserWindow({
		minWidth: 1280,
		minHeight: 720,
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
		},
	});
	win.loadFile('index.html');
	win.maximize();
}

ipcMain.on('toggle-connection', async () => {
	if (!connected) {
		setReconnect(true);
		sock = await startSock({ log, setStatus, updateButton });
		connected = true;
		updateButton('Tutup Koneksi');
	} else {
		log('Memutus koneksi dari WhatsApp...');

		setReconnect(false);

		if (sock) {
			sock.ev.removeAllListeners();

			if (sock) {
				try {
					sock.end();
				} catch (e) {
					log('Error saat end socket: ' + e.message);
				}
			}

			sock = null;
		}

		connected = false;
		setStatus('terputus');
		log('Koneksi dihentikan sementara (Sesi tetap aman).');
		updateButton('Buka Koneksi');
	}
});

ipcMain.handle('message', async (_, payload) => {
	if (!sock?.user) {
		throw new Error('WhatsApp belum siap');
	}

	const { number, message } = payload;
	const jid = number.replace(/\D/g, '') + '@s.whatsapp.net';

	await sock.presenceSubscribe(jid);
	await sock.sendPresenceUpdate('composing', jid);
	await new Promise(resolve => setTimeout(resolve, 500));
	await sock.sendMessage(jid, { text: message });
	await sock.sendPresenceUpdate('paused', jid);

	return true;
});

ipcMain.handle('get-contacts', async () => {
	try {
		const contacts = getContacts();
		return contacts;
	} catch (error) {
		console.error('Gagal membaca kontak:', error);
		return {};
	}
});

ipcMain.handle('save-contacts', async (event, data) => {
	try {
		fs.writeFileSync(contactPath, JSON.stringify(data, null, 4));
		return true;
	} catch (error) {
		console.error('Gagal menyimpan kontak:', error);
		return false;
	}
});

ipcMain.on('logout-whatsapp', async () => {
	log('Proses Logout dari WhatsApp diminta...');

	try {
		if (sock) {
			await sock.logout();
			sock = null;
		} else {
			const userDataPath = app.getPath('userData');
			const authFolder = path.join(userDataPath, 'wa_auth_session');

			if (fs.existsSync(authFolder)) {
				fs.rmSync(authFolder, { recursive: true, force: true });
			}
		}

		connected = false;
		setStatus('terputus');
		updateButton('Buka Koneksi');
		log(
			'Berhasil Logout. Sesi telah dihapus. Silakan Buka Koneksi untuk scan QR baru.',
		);
	} catch (error) {
		log('Gagal melakukan logout: ' + error.message);
	}
});

app.whenReady().then(() => {
	createWindow();
	reassignMissedSchedules();
	scheduleNext();
});
