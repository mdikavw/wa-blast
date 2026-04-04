let contacts = {};
let rows = {};
let variables = {};

function addLog(text) {
	const container = document.getElementById('log-container');
	const log = document.createElement('div');
	log.textContent = text;

	container.appendChild(log);
	container.scrollTop = container.scrollHeight;
}

async function loadContacts() {
	const table = document.getElementById('status-table');
	const res = await fetch('contact.json');
	contacts = await res.json();

	let i = 1;
	Object.entries(contacts).forEach(([name, data]) => {
		const tr = document.createElement('tr');

		const dynamicCols = variables.columns || [];

		tr.innerHTML = `
			<td class="p-2">${data.sapaan} ${name}</td>
			<td class="p-2">+${data.number ?? '-'}</td>
			${dynamicCols.map(() => `<td class="p-2 text-center">-</td>`).join('')}
			<td class="p-2 text-center">-</td>
			<td class="p-2 text-center">-</td>
		`;

		table.appendChild(tr);

		const key = normalizeName(name);
		const rowObj = {};

		// kolom dinamis
		dynamicCols.forEach((col, index) => {
			rowObj[col] = tr.children[2 + index];
		});

		// tetap
		rowObj.jadwal = tr.children[2 + dynamicCols.length];
		rowObj.status = tr.children[3 + dynamicCols.length];

		rows[key] = rowObj;
	});
}

function normalizeName(name) {
	return name
		.toUpperCase()
		.replace(/,.*$/, '') // hapus semua gelar
		.replace(/\s+/g, ' ')
		.trim();
}

function renderHeader() {
	const head = document.getElementById('table-head');
	const dynamicCols = variables.columns || [];
	head.innerHTML = `
	<tr>
			<th>Nama</th>
			<th>Nomor</th>
			${dynamicCols.map(col => `<th>${col}</th>`).join('')}
			<th>Jadwal</th>
			<th>Status</th>
		</tr>`;
}

function updateInitialTable(contacts) {
	const table = document.getElementById('status-table');
	table.innerHTML = '';

	const dynamicCols = variables.columns || [];

	Object.entries(contacts).forEach(([name, data]) => {
		const tr = document.createElement('tr');

		tr.innerHTML = `
			<td class="p-2">${data.sapaan} ${name}</td>
			<td class="p-2">+${data.number ?? '-'}</td>
			${dynamicCols.map(() => `<td class="p-2 text-center">-</td>`).join('')}
			<td class="p-2 text-center">-</td>
			<td class="p-2 text-center">-</td>
		`;

		table.appendChild(tr);
	});
}

function updateTable(data = []) {
	const table = document.getElementById('status-table');
	table.innerHTML = '';
	const dynamicCols = variables.columns || [];

	data.sort((a, b) => new Date(a.jadwal) - new Date(b.jadwal)).forEach(
		item => {
			const tr = document.createElement('tr');

			tr.innerHTML = `
				<td class="p-2">${item.nama}</td>
				<td class="p-2">+${item.nomor}</td>
				${dynamicCols
					.map(
						col =>
							`<td class="p-2 text-center">${item[col] ?? '-'}</td>`,
					)
					.join('')}				
				<td class="p-2 text-center">${
					item.jadwal
						? new Date(item.jadwal).toLocaleTimeString()
						: '-'
				}</td>
				<td class="p-2 text-center">${item.status ?? '-'}</td>
			`;

			table.appendChild(tr);
		},
	);
}

window.addEventListener('DOMContentLoaded', async () => {
	variables = await api.getVariables();
	renderHeader();
	await loadContacts();
	async function init() {
		const exists = await api.checkBatch();

		if (exists) {
			const data = await api.getBatch();
			updateTable(data);

			addLog('Batch hari ini sudah ada (mode merge aktif)');
		} else {
			updateInitialTable(contacts); // 🔥 ini yang penting
			addLog('Silakan input batch hari ini');
		}
	}

	document
		.getElementById('start-scheduler')
		.addEventListener('click', async () => {
			try {
				await api.startScheduler();
				addLog('Scheduler dijalankan');
			} catch (err) {
				addLog(err.message);
			}
		});

	document
		.getElementById('save-batch')
		.addEventListener('click', async () => {
			const csv = document.getElementById('csv-input').value;

			if (!csv.trim()) return;

			try {
				await api.saveBatch(csv);
				addLog('Batch berhasil disimpan');

				const data = await api.getBatch();
				updateTable(data);

				await init();
			} catch (err) {
				addLog(err.message);
			}
		});

	// ✅ pindahkan ke dalam
	// const fileStatus = document.getElementById('file-status');
	// fileStatus.addEventListener('change', async e => {
	// 	const file = e.target.files[0];
	// 	if (!file) return;

	// 	const buffer = await file.arrayBuffer();
	// 	const data = await api.parseXLSX(buffer);
	// 	const saved = await api.saveStatus(data);
	// 	updateTable(saved);
	// });
	const timeInput = document.getElementById('schedule-time');
    const saveTimeBtn = document.getElementById('save-time');
	const activeTime = await api.getScheduleTime();
	const messageInput = document.getElementById('message-template');
	const saveMessageBtn = document.getElementById('save-message');

	if (activeTime) {
        timeInput.value = activeTime;
    }

    // Aksi saat tombol simpan ditekan
    saveTimeBtn.addEventListener('click', async () => {
        const selectedTime = timeInput.value;
        
        if (!selectedTime) {
            addLog('Gagal: Silakan atur jam terlebih dahulu.');
            return;
        }

        try {
            await api.setScheduleTime(selectedTime);
            addLog(`Jam pengiriman berhasil diatur ke: ${selectedTime}`);
        } catch (err) {
            addLog(`Gagal mengatur jam: ${err.message}`);
        }
    });
	// load saat awal
	if (variables?.message) {
		messageInput.value = variables.message;
	}

	// simpan
	saveMessageBtn.addEventListener('click', async () => {
		const message = messageInput.value;

		await api.saveVariables({
			...vars,
			message,
		});

		addLog('Template pesan disimpan');
	});

	const btn = document.getElementById('btn');
	const title = document.getElementById('title');

	api.onMessage(msg => {
		title.innerText = msg;
	});

	const logsContainer = document.getElementById('log-container');
	const qrContainer = document.getElementById('qr');
	let lastLog = null;

	api.onLog(msg => {
		if (typeof msg === 'object' && msg.type === 'qr') {
			qrContainer.innerHTML = `<img src="${msg.data}" width="200"/>`;
			return;
		}
		if (msg === lastLog && typeof msg === 'string') return;
		lastLog = msg;

		const line = document.createElement('div');
		line.innerText = msg;
		logsContainer.appendChild(line);

		logsContainer.scrollTop = logsContainer.scrollHeight;
	});

	const cd = document.getElementById('cd');
	cd.addEventListener('click', () => {
		api.toggleConnection();
	});
	api.onButtonUpdate(label => {
		cd.innerText = label;
	});

	const status = document.getElementById('status');
	const statusIndicator = document.getElementById('status-indicator');

	api.onStatus(text => {
		status.innerText = text;

		statusIndicator.classList.remove(
			'bg-green-400',
			'bg-yellow-400',
			'bg-red-400',
		);
		cd.classList.remove('bg-green-400', 'bg-yellow-400', 'bg-red-400');

		if (text === 'terhubung') {
			statusIndicator.classList.add('bg-green-400');
			cd.classList.add('bg-red-400');
		}
		if (text === 'menyambungkan') {
			status.innerText = 'Menyambungkan...';
			statusIndicator.classList.add('bg-yellow-400');
		}
		if (text === 'terputus') {
			statusIndicator.classList.add('bg-red-400');
			cd.classList.add('bg-green-400');
		}
	});

	api.onStatusData(data => {
		updateTable(data);
	});

	window.goToVariable = function () {
		api.navigate('variable.html');
	};

	window.goToAturKontak = function () {
		api.navigate('atur-kontak.html');
	};
	await init();
});
