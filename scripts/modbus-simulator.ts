/**
 * Minimal Modbus TCP simulator for manual testing of the SCADA app without a
 * real PLC. Exposes a bank of coils that respond to FC1 (read coils) and
 * FC5 (write single coil). Run with: npm run simulator
 *
 * Default: listens on 127.0.0.1:15020, unit id (slave id) 1, 32 coils
 * (addresses 0-31), all initialized to OFF except a couple toggled ON so
 * you have something to look at immediately.
 */
import { ServerTCP } from 'modbus-serial';

const HOST = process.env.SIM_HOST ?? '127.0.0.1';
const PORT = Number(process.env.SIM_PORT ?? 15020);
const UNIT_ID = Number(process.env.SIM_UNIT_ID ?? 1);
const COIL_COUNT = Number(process.env.SIM_COIL_COUNT ?? 32);

const coils = new Array<boolean>(COIL_COUNT).fill(false);
coils[0] = true;
coils[2] = true;

const vector = {
	getCoil: (addr: number, _unitID: number) => {
		if (addr < 0 || addr >= coils.length) return false;
		return coils[addr];
	},
	setCoil: (addr: number, value: boolean, _unitID: number) => {
		if (addr < 0 || addr >= coils.length) return;
		coils[addr] = value;
		console.log(`[sim] coil ${addr} -> ${value ? 'ON' : 'OFF'}`);
	}
};

const server = new ServerTCP(vector, { host: HOST, port: PORT, unitID: UNIT_ID, debug: false });

server.on('initialized', () => {
	console.log(`Modbus TCP simulator listening on ${HOST}:${PORT} (unit id ${UNIT_ID})`);
	console.log(`Coils: ${COIL_COUNT} (addresses 0-${COIL_COUNT - 1})`);
	console.log('Initial ON coils: 0, 2');
	console.log('Press Ctrl+C to stop. Stopping this process simulates a device going offline.');
});

server.on('socketError', (err) => {
	console.error('[sim] socket error:', err);
});

server.on('serverError', (err) => {
	console.error('[sim] server error:', err);
});

process.on('SIGINT', () => {
	server.close(() => process.exit(0));
});
