import type { RequestHandler } from './$types';
import { buildCircuitsExportCsv } from '#lib/server/csv-import.ts';
import { getSpace } from '#lib/server/repo.ts';

// GET /api/circuits/export?space_id=<id>
//   Exports every Circuit belonging to the given Space as CSV text
//   (circuit_id,space_name,device_name,device_ip,device_port,device_slave_id,
//   coil_address,name). Served with Content-Disposition: attachment so the
//   browser downloads it directly rather than navigating to it.
//   Re-importing this file unmodified (POST /api/circuits/import) should
//   resolve every row as an update of the same Circuit, since circuit_id
//   round-trips.
export const GET: RequestHandler = async ({ url }) => {
	const spaceIdRaw = url.searchParams.get('space_id');
	if (!spaceIdRaw) {
		return new Response('space_id query parameter is required', { status: 400 });
	}
	const spaceId = Number(spaceIdRaw);
	if (!Number.isInteger(spaceId) || spaceId <= 0) {
		return new Response('space_id must be a positive integer', { status: 400 });
	}
	const space = getSpace(spaceId);
	if (!space) {
		return new Response('space not found', { status: 404 });
	}

	const csv = buildCircuitsExportCsv(spaceId);
	const safeName = space.name.replace(/[^a-zA-Z0-9_-]+/g, '_') || 'space';

	return new Response(csv, {
		status: 200,
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="circuits_${safeName}_${spaceId}.csv"`
		}
	});
};
