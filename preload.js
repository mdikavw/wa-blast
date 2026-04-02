const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    sendMessage: (number, message) => {
        ipcRenderer.invoke('message', { number, message });
    },
    onMessage: callback => {
        ipcRenderer.on('message-reply', (_, data) => callback(data));
    },
    onLog: callback => {
        ipcRenderer.on('log', (_, data) => callback(data));
    },
    startConnection: () => ipcRenderer.send('start-connection'),
    onStatus: callback =>
        ipcRenderer.on('status', (_, status) => callback(status)),
    toggleConnection: () => ipcRenderer.send('toggle-connection'),
    onButtonUpdate: callback =>
        ipcRenderer.on('update-button', (_, data) => callback(data)),
    parseXLSX: buffer => ipcRenderer.invoke('parse-xlsx', buffer),
    saveStatus: data => ipcRenderer.invoke('save-status', data),
    loadStatus: () => ipcRenderer.invoke('load-status'),
    onStatusData: callback =>
        ipcRenderer.on('status-data', (_, data) => callback(data)),
    navigate: page => ipcRenderer.send('navigate', page),
    getVariables: () => ipcRenderer.invoke('get-variables'),
    saveVariables: data => ipcRenderer.invoke('save-variables', data),
    getContacts: () => ipcRenderer.invoke('get-contacts'),
    saveContacts: data => ipcRenderer.invoke('save-contacts', data),
    checkBatch: () => ipcRenderer.invoke('check-batch'),
    saveBatch: csv => ipcRenderer.invoke('save-batch', csv),
    getBatch: () => ipcRenderer.invoke('get-batch'),
    startScheduler: () => ipcRenderer.invoke('start-scheduler'),
});