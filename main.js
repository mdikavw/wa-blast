const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const startSock = require('./whatsapp/socket.js');
// const XLSX = require('xlsx');
const fs = require('fs');

let win;
let sock;
let connected;
const contacts = JSON.parse(
	fs.readFileSync(path.join(__dirname, 'contact.json')),
);
let statusData = [];
let schedulerTimer = null;

const batchDir = path.join(__dirname, 'data', 'status');

if (!fs.existsSync(batchDir)) {
	fs.mkdirSync(batchDir, { recursive: true });
}

function getToday() {
	return new Date().toISOString().split('T')[0];
}

function getContacts() {
	const file = path.join(__dirname, 'contact.json');

	if (!fs.existsSync(file)) return {};

	return JSON.parse(fs.readFileSync(file));
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

	if (!headers.includes('nomor') || !headers.includes('selisih')) {
		throw new Error('CSV harus punya kolom: nomor, selisih');
	}

	const resultMap = {};

	// 1. isi dari existing + default "-"
	Object.values(contactMap).forEach(contact => {
		resultMap[contact.nomor] = {
			...contact,
			selisih: existing[contact.nomor]?.selisih ?? '-',
		};
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

		resultMap[nomor] = {
			...contact,
			selisih: obj.selisih || '-',
		};
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

// ipcMain.handle('parse-xlsx', (_, buffer) => {
// 	const workbook = XLSX.read(buffer);
// 	const sheet = workbook.Sheets[workbook.SheetNames[0]];
// 	const result = [];

// 	for (let row = 11; row <= 36; row++) {
// 		const nama = sheet[`C${row}`]?.v;
// 		const selisih = sheet[`L${row}`]?.v;

// 		if (!nama) continue;

// 		const item = {
// 			nama,
// 			selisih,
// 			kontak: contacts[nama].number || null, // ✅ langsung ambil
// 			jadwal: new Date().toISOString(),
// 			status: 'menunggu',
// 		};

// 		result.push(item);
// 	}
// 	console.log(result);

// 	return result;
// });

function todayFile() {
	const today = new Date().toISOString().slice(0, 10);
	return path.join(__dirname, 'data', 'batches', `${today}.json`);
}

//simpan data penstatusan
function saveStatus() {
	fs.mkdirSync(path.dirname(todayFile()), { recursive: true });
	fs.writeFileSync(todayFile(), JSON.stringify(statusData, null, 2));
}

//load data penstatusan
function loadStatus() {
	const file = todayFile();
	// jika hari ini tidak ada file, keluar
	if (!fs.existsSync(file)) {
		statusData = [];
		return;
	}
	//assign file ke statusData
	statusData = JSON.parse(fs.readFileSync(file));
}

ipcMain.handle('start-scheduler', () => {
	console.log('Start scheduler dari batch');

	loadStatus();

	// 🔥 kalau belum ada status → generate dari batch
	if (!statusData.length) {
		generateSchedule();
	}

	reassignMissedSchedules();
	sendStatusUpdate();
	scheduleNext();

	return statusData;
});

function generateSchedule(startTime = '14:20') {
	const batch = getTodayBatch(); // ❌ jangan difilter di sini

	const [hour, minute] = startTime.split(':').map(Number);
	const start = new Date();
	start.setHours(hour, minute, 0, 0);

	let currentTime = start.getTime();

	const minInterval = 60 * 1000;
	const maxInterval = 5 * 60 * 1000;

	statusData = batch.map(row => {
		const val = Number(String(row.selisih).trim());

		// ❌ skip kirim
		if (!Number.isFinite(val) || val <= 0) {
			return {
				nama: row.nama,
				nomor: row.nomor,
				selisih: row.selisih,
				jadwal: null,
				status: 'skip',
			};
		}

		// ✅ normal schedule
		const item = {
			nama: row.nama,
			nomor: row.nomor,
			selisih: Number(row.selisih),
			jadwal: new Date(currentTime).toISOString(),
			status: 'menunggu',
		};

		const randomInterval =
			Math.random() * (maxInterval - minInterval) + minInterval;

		currentTime += randomInterval;

		return item;
	});

	saveStatus();
}

function reassignMissedSchedules() {
	console.log('Reassigning');
	const pending = statusData
		.filter(i => i.status === 'menunggu')
		.sort((a, b) => new Date(a.jadwal) - new Date(b.jadwal));
	// jika tidak ada data dengan status "menunggu", keluar
	if (!pending.length) return;

	const now = Date.now();

	// jika data pending[] paling awal di depan now(), keluar
	if (new Date(pending[0].jadwal).getTime() > now) return;
	// else
	console.log('Ada jadwal terlewat, menjadwalkan ulang...');

	let currentTime = now;

	const minInterval = 60 * 1000;
	const maxInterval = 5 * 60 * 1000;

	for (const item of pending) {
		item.jadwal = new Date(currentTime).toISOString();

		const randomInterval =
			Math.random() * (maxInterval - minInterval) + minInterval;

		currentTime += randomInterval;
	}

	saveStatus();
	sendStatusUpdate();
}

function getNextPending() {
	let next = null;

	for (const item of statusData) {
		if (item.status !== 'menunggu') continue;

		if (!next || new Date(item.jadwal) < new Date(next.jadwal)) {
			next = item;
		}
	}

	return next;
}

function scheduleNext() {
	// 🔥 STOP timer lama
	if (schedulerTimer) {
		clearTimeout(schedulerTimer);
		schedulerTimer = null;
	}

	const next = getNextPending();

	if (!next) {
		console.log('Semua pesan selesai');
		return;
	}

	if (next.status === 'skip') {
		return scheduleNext();
	}

	const delay = Math.max(0, new Date(next.jadwal) - Date.now());

	schedulerTimer = setTimeout(async () => {
		try {
			next.status = 'mengirim';
			saveStatus();
			sendStatusUpdate();

			await sendWhatAppMessage(next.nomor, next.nama, next.selisih);

			next.status = 'terkirim';
			next.terkirim = new Date().toISOString();
		} catch (err) {
			next.status = 'gagal';
		}

		saveStatus();
		sendStatusUpdate();

		// 🔁 lanjut ke berikutnya
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

async function sendWhatAppMessage(nomor, nama, selisih) {
	if (!sock?.user) {
		throw new Error('WhatsApp belum siap');
	}

	const jid = nomor + '@s.whatsapp.net';

	const contact = contacts[nama] || {};
	const sapaan = contact.sapaan || '';

	const variables = JSON.parse(fs.readFileSync(variablesPath));
	let template =
		variables.message ||
		'Selamat malam {sapaan}, Anda memiliki {selisih} data.';

	const message = template
		.replace(/{nama}/g, nama)
		.replace(/{sapaan}/g, sapaan)
		.replace(/{selisih}/g, selisih);

	await sock.presenceSubscribe(jid);
	await sock.sendPresenceUpdate('composing', jid);

	await new Promise(r => setTimeout(r, 1500));

	await sock.sendMessage(jid, { text: message });

	await sock.sendPresenceUpdate('paused', jid);
}

ipcMain.handle('save-status', (_, data) => {
	generateSchedule(data);
	reassignMissedSchedules();
	scheduleNext();
	return statusData;
});

ipcMain.handle('load-status', (_, data) => {
	loadStatus();
	return statusData;
});

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
	if (win) {
		win.webContents.send('status-data', statusData);
	}
}

ipcMain.on('navigate', (event, page) => {
	if (win) {
		win.loadFile(path.join(__dirname, page));
	}
});
const variablesPath = path.join(__dirname, 'data', 'variables.json');

ipcMain.handle('get-variables', () => {
	if (!fs.existsSync(variablesPath)) return {};
	return JSON.parse(fs.readFileSync(variablesPath));
});

ipcMain.handle('save-variables', (_, data) => {
	fs.writeFileSync(variablesPath, JSON.stringify(data, null, 2));
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
		sock = await startSock({ log, setStatus, updateButton });
		connected = true;
		updateButton('Tutup Koneksi');
	} else {
		if (sock) {
			await sock.logout();
			sock = null;
		}
		connected = false;
		setStatus('terputus');
		log('Koneksi terputus');
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

app.whenReady().then(() => {
	createWindow();

	loadStatus();
	//urutkan dan generate jadwal baru jika terlewat
	reassignMissedSchedules();
	scheduleNext();
});
