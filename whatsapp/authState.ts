import {
	AuthenticationCreds,
	AuthenticationState,
	initAuthCreds,
	SignalDataTypeMap,
} from 'baileys';
import { getKey, setKey } from './authStore';

export async function useSQLiteAuthState(): Promise<{
	state: AuthenticationState;
	saveCreds: () => Promise<void>;
}> {
	const creds =
		((await getKey('creds')) as unknown as AuthenticationCreds) || null;

	const state: AuthenticationState = {
		creds: (creds as unknown as AuthenticationCreds) ?? initAuthCreds(),
		keys: {
			get: async (type, ids) => {
				const data: { [id: string]: SignalDataTypeMap[typeof type] } =
					{};

				for (const id of ids) {
					const key = `${type}-${id}`;

					const value = await getKey(key);

					if (value) {
						data[id] =
							value as unknown as SignalDataTypeMap[typeof type];
					}
				}

				return data;
			},

			set: async data => {
				for (const type in data) {
					const typedType = type as keyof SignalDataTypeMap;

					for (const id in data[typedType]) {
						const key = `${typedType}-${id}`;

						await setKey(key, data[typedType][id]);
					}
				}
			},
		},
	};
	const saveCreds = async () => {
		await setKey('creds', state.creds);
	};

	return { state, saveCreds };
}
