"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSQLiteAuthState = useSQLiteAuthState;
const baileys_1 = require("baileys");
const authStore_1 = require("./authStore");
async function useSQLiteAuthState() {
    const creds = (await (0, authStore_1.getKey)('creds')) || null;
    const state = {
        creds: creds ?? (0, baileys_1.initAuthCreds)(),
        keys: {
            get: async (type, ids) => {
                const data = {};
                for (const id of ids) {
                    const key = `${type}-${id}`;
                    const value = await (0, authStore_1.getKey)(key);
                    if (value) {
                        data[id] =
                            value;
                    }
                }
                return data;
            },
            set: async (data) => {
                for (const type in data) {
                    const typedType = type;
                    for (const id in data[typedType]) {
                        const key = `${typedType}-${id}`;
                        await (0, authStore_1.setKey)(key, data[typedType][id]);
                    }
                }
            },
        },
    };
    const saveCreds = async () => {
        await (0, authStore_1.setKey)('creds', state.creds);
    };
    return { state, saveCreds };
}
