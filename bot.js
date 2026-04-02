import makeWASocket, { useMultiFileAuthState } from 'baileys';
import P from 'pino';

const { state, saveCreds } = useMultiFileAuthState('auth');

const sock = makeWASocket({
	auth: state,
	logger: P(),
});
