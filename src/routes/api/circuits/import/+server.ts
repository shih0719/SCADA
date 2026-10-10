import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { runCsvImport, CsvFormatError } from '#lib/server/csv-import.ts';
import { ValidationError } from '#lib/server/validation.ts';

// POST /api/circuits/import?dryRun=true
//   Body: raw CSV text (the whole file content, sent as the request body;
//   content-type does not matter, it is always read as text).
//   Parses + validates + simulates the import without writing to the DB.
//   Returns an ImportResult (see #lib/types.ts) describing what *would*
//   happen: which Spaces/Devices would be newly created, which Circuit rows
//   would be created, and which rows have errors/warnings.
//
// POST /api/circuits/import  (no dryRun param, or dryRun=false)
//   Same body format. Actually performs the import: creates missing
//   Space/Device rows and all valid Circuit rows inside a single DB
//   transaction (rows with validation errors are simply skipped, they do not
//   abort the transaction). Returns an ImportResult with real ids populated.
export const POST: RequestHandler = async ({ request, url }) => {
	const dryRunParam = url.searchParams.get('dryRun');
	const dryRun = dryRunParam !== null && dryRunParam !== 'false';

	try {
		const csvText = await request.text();
		if (!csvText || !csvText.trim()) {
			return json({ error: 'request body (CSV text) is empty' }, { status: 400 });
		}
		const result = runCsvImport(csvText, dryRun);
		return json(result);
	} catch (e) {
		if (e instanceof CsvFormatError || e instanceof ValidationError) {
			return json({ error: e.message }, { status: 400 });
		}
		throw e;
	}
};
