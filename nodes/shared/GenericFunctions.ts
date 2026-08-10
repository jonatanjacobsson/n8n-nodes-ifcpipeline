import {
	IExecuteFunctions,
	IHookFunctions,
	ILoadOptionsFunctions,
	IDataObject,
	INodeExecutionData,
	INodePropertyOptions,
	NodeApiError,
	NodeOperationError,
	IRequestOptions,
	IHttpRequestMethods,
} from 'n8n-workflow';

/**
 * Self-tuning client-side rate limiter.
 *
 * No UI, no config. The limiter maintains one token bucket per gateway
 * `baseUrl` (so every IFC* node in every workflow in this n8n process
 * shares the same budget when they all point at the same API) and adapts
 * its rate using TCP-style AIMD:
 *
 *   • Start at RATE_INITIAL rps (well under the measured ~150 rps ceiling
 *     observed end-to-end through Cloudflare).
 *   • Every AI_INTERVAL_MS of sustained success, add 1 rps (up to RATE_MAX).
 *   • On any 429/503 response, halve the rate (down to RATE_MIN) and, if
 *     the server included a `Retry-After`, wait it out before resuming.
 *
 * Because callers feed success/pushback signals back into the limiter via
 * `reportSuccess` / `reportBackpressure`, the n8n nodes converge on the
 * real ceiling — whether that's the FastAPI gateway, a Cloudflare WAF
 * rule, or a future slowapi middleware — without anyone editing anything.
 *
 * Acquisitions are serialized on a per-bucket promise chain so refill and
 * token math stay race-free under concurrent fan-out inside one process.
 */
const RATE_INITIAL = 80;
const RATE_MIN = 2;
const RATE_MAX = 200;
const AI_INTERVAL_MS = 1000; // +1 rps per second of success
const BACKPRESSURE_COOLDOWN_MS = 2000;

interface AdaptiveBucket {
	rps: number;
	tokens: number;
	lastRefillMs: number;
	lastIncreaseMs: number;
	pausedUntilMs: number;
	chain: Promise<void>;
}

const buckets: Map<string, AdaptiveBucket> = new Map();

function getBucket(key: string): AdaptiveBucket {
	let bucket = buckets.get(key);
	if (!bucket) {
		const now = Date.now();
		bucket = {
			rps: RATE_INITIAL,
			tokens: RATE_INITIAL,
			lastRefillMs: now,
			lastIncreaseMs: now,
			pausedUntilMs: 0,
			chain: Promise.resolve(),
		};
		buckets.set(key, bucket);
	}
	return bucket;
}

function refill(bucket: AdaptiveBucket): void {
	const now = Date.now();
	const deltaMs = now - bucket.lastRefillMs;
	if (deltaMs > 0) {
		bucket.tokens = Math.min(
			bucket.rps,
			bucket.tokens + (deltaMs * bucket.rps) / 1000,
		);
		bucket.lastRefillMs = now;
	}
}

export async function acquireRateLimitToken(baseUrl: string): Promise<void> {
	const key = normalizeBaseUrlKey(baseUrl);
	const bucket = getBucket(key);
	const next = bucket.chain.then(async () => {
		// Honor any active pushback-cooldown before spending a token.
		const paused = bucket.pausedUntilMs - Date.now();
		if (paused > 0) {
			await sleep(paused);
			bucket.lastRefillMs = Date.now();
			bucket.tokens = Math.min(bucket.rps, 1); // resume cautiously
		}
		refill(bucket);
		if (bucket.tokens < 1) {
			const waitMs = Math.max(
				1,
				Math.ceil(((1 - bucket.tokens) * 1000) / bucket.rps),
			);
			await sleep(waitMs);
			refill(bucket);
		}
		bucket.tokens = Math.max(0, bucket.tokens - 1);
	});
	bucket.chain = next.catch(() => undefined);
	await next;
}

export function reportSuccess(baseUrl: string): void {
	const bucket = buckets.get(normalizeBaseUrlKey(baseUrl));
	if (!bucket) return;
	const now = Date.now();
	// Additive increase: +1 rps per AI_INTERVAL_MS of observed success.
	// Gated by `now >= pausedUntilMs` so we don't ramp up during a cooldown.
	if (
		now >= bucket.pausedUntilMs &&
		now - bucket.lastIncreaseMs >= AI_INTERVAL_MS &&
		bucket.rps < RATE_MAX
	) {
		bucket.rps = Math.min(RATE_MAX, bucket.rps + 1);
		bucket.lastIncreaseMs = now;
	}
}

export function reportBackpressure(
	baseUrl: string,
	retryAfterSeconds?: number,
): void {
	const bucket = getBucket(normalizeBaseUrlKey(baseUrl));
	// Multiplicative decrease: halve the rate, clamped to RATE_MIN.
	bucket.rps = Math.max(RATE_MIN, Math.floor(bucket.rps / 2));
	bucket.lastIncreaseMs = Date.now(); // reset AI timer
	// Server-advertised backoff wins over our default cooldown.
	const retryMs = Number.isFinite(retryAfterSeconds) && (retryAfterSeconds as number) > 0
		? Math.min(30_000, Math.ceil((retryAfterSeconds as number) * 1000))
		: BACKPRESSURE_COOLDOWN_MS;
	bucket.pausedUntilMs = Math.max(bucket.pausedUntilMs, Date.now() + retryMs);
	bucket.tokens = 0;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeBaseUrlKey(baseUrl: string): string {
	// Collapse trailing slashes so `https://api/` and `https://api` share one
	// bucket. Falls back to a literal string if URL parsing fails.
	try {
		const u = new URL(baseUrl);
		return `${u.protocol}//${u.host}`;
	} catch {
		return (baseUrl || '').replace(/\/+$/, '') || 'default';
	}
}

/**
 * Inspect an error thrown by n8n's request helper and decide whether the
 * server is pushing back. Returns the Retry-After seconds (or undefined)
 * when the status is 429/503, or null when the error is something else.
 */
function extractPushback(error: unknown): { retryAfterSec?: number } | null {
	const e = error as {
		statusCode?: number;
		httpCode?: number | string;
		response?: { statusCode?: number; headers?: Record<string, string | string[]> };
	};
	const status =
		e?.statusCode ?? e?.response?.statusCode ?? Number(e?.httpCode) ?? undefined;
	if (status !== 429 && status !== 503) return null;
	const headers = e?.response?.headers || {};
	const raw = (headers['retry-after'] ?? headers['Retry-After']) as
		| string
		| string[]
		| undefined;
	const value = Array.isArray(raw) ? raw[0] : raw;
	if (!value) return {};
	const asNum = Number(value);
	if (Number.isFinite(asNum)) return { retryAfterSec: asNum };
	// HTTP-date form: compute delta from now.
	const asDate = Date.parse(value);
	if (Number.isFinite(asDate)) {
		const delta = Math.max(0, (asDate - Date.now()) / 1000);
		return { retryAfterSec: delta };
	}
	return {};
}

/**
 * Make an API request to IFC Pipeline.
 *
 * These nodes target the object-storage variant of ifcpipeline exclusively
 * (USE_OBJECT_STORAGE=true). All file references are S3 object keys under
 * the configured bucket — `uploads/<name>` for inputs, `output/<subdir>/<name>`
 * for outputs. The gateway's `normalize_input_key` / `normalize_output_key`
 * tolerate a leading slash and `s3://bucket/...` URIs, so previous job
 * outputs can be chained straight into the next node without rewriting.
 */
export async function ifcPipelineApiRequest(
	this: IHookFunctions | IExecuteFunctions | ILoadOptionsFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	body: IDataObject = {},
	qs: IDataObject = {},
	uri?: string,
	option: IDataObject = {},
) {
	const credentials = await this.getCredentials('ifcPipelineApi');
	const baseUrl = credentials.baseUrl as string;

	const options: IRequestOptions = {
		method,
		body,
		qs,
		uri: uri || `${baseUrl}${endpoint}`,
		json: true,
	};

	if (!Object.keys(body).length) {
		delete options.body;
	}

	if (!Object.keys(qs).length) {
		delete options.qs;
	}

	return sendWithAdaptiveLimit.call(this, baseUrl, options);
}

/**
 * Download a file from the API. `/download/{token}` on the object-storage
 * gateway responds with a 307 redirect to a short-lived presigned MinIO/S3
 * URL, so we follow redirects transparently. `removeRefererHeader` and n8n's
 * cross-origin auth rules prevent `X-API-Key` from leaking to the S3 host.
 */
export async function ifcPipelineApiRequestDownload(
	this: IHookFunctions | IExecuteFunctions | ILoadOptionsFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	body: IDataObject = {},
	qs: IDataObject = {},
	uri?: string,
	option: IDataObject = {},
) {
	const credentials = await this.getCredentials('ifcPipelineApi');
	const baseUrl = credentials.baseUrl as string;

	const options: IRequestOptions = {
		method,
		body,
		qs,
		uri: uri || `${baseUrl}${endpoint}`,
		json: true,
		encoding: null,
		followRedirect: true,
		followAllRedirects: true,
		removeRefererHeader: true,
	} as IRequestOptions;

	if (!Object.keys(body).length) {
		delete options.body;
	}

	if (!Object.keys(qs).length) {
		delete options.qs;
	}

	const response = await sendWithAdaptiveLimit.call(this, baseUrl, options);
	return { data: response };
}

/**
 * Upload a file via the API gateway. The gateway streams the body straight
 * into the S3 bucket (no local disk roundtrip) and returns
 * `{ storage: "s3", bucket, object_key, object_url, file_path }`.
 */
export async function ifcPipelineApiRequestUpload(
	this: IHookFunctions | IExecuteFunctions | ILoadOptionsFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	formData: IDataObject = {},
	qs: IDataObject = {},
	uri?: string,
	option: IDataObject = {},
) {
	const credentials = await this.getCredentials('ifcPipelineApi');
	const baseUrl = credentials.baseUrl as string;

	const options: IRequestOptions = {
		method,
		formData,
		qs,
		uri: uri || `${baseUrl}${endpoint}`,
		json: true,
	};

	if (!Object.keys(formData).length) {
		delete options.formData;
	}

	if (!Object.keys(qs).length) {
		delete options.qs;
	}

	return sendWithAdaptiveLimit.call(this, baseUrl, options);
}

/**
 * Shared send path used by every ifcPipelineApiRequest* helper. Acquires a
 * token from the baseUrl bucket, issues the request, feeds success or
 * 429/503 pushback back into the adaptive limiter, and retries exactly
 * once after an involuntary slowdown so a single transient 429 doesn't
 * fail the workflow item.
 */
async function sendWithAdaptiveLimit(
	this: IHookFunctions | IExecuteFunctions | ILoadOptionsFunctions,
	baseUrl: string,
	options: IRequestOptions,
): Promise<any> {
	const attempt = async (): Promise<any> => {
		await acquireRateLimitToken(baseUrl);
		const response = await this.helpers.requestWithAuthentication.call(
			this,
			'ifcPipelineApi',
			options,
		);
		reportSuccess(baseUrl);
		return response;
	};
	try {
		return await attempt();
	} catch (error) {
		const pushback = extractPushback(error);
		if (pushback === null) {
			throw new NodeApiError(this.getNode(), error as any);
		}
		reportBackpressure(baseUrl, pushback.retryAfterSec);
		try {
			return await attempt();
		} catch (retryError) {
			throw new NodeApiError(this.getNode(), retryError as any);
		}
	}
}

/**
 * Normalize a user-supplied reference into an S3 object key.
 *
 * Accepts, in order:
 * - `s3://bucket/key`         → `key`
 * - `/uploads/foo.ifc`        → `uploads/foo.ifc`
 * - `uploads/foo.ifc`         → `uploads/foo.ifc` (unchanged)
 * - `foo.ifc`                 → `uploads/foo.ifc` (bare name lives under uploads/)
 *
 * Bare filenames are the common case when chaining from an earlier step.
 * Anything containing a separator is trusted and only has its leading slash
 * stripped — this mirrors the gateway's `normalize_input_key`.
 */
export function normalizeObjectKey(reference: string): string {
	if (!reference) return reference;
	if (reference.startsWith('s3://')) {
		const withoutScheme = reference.slice('s3://'.length);
		const firstSlash = withoutScheme.indexOf('/');
		return firstSlash === -1 ? withoutScheme : withoutScheme.slice(firstSlash + 1);
	}
	const trimmed = reference.replace(/^\/+/, '');
	if (trimmed.includes('/')) return trimmed;
	return `uploads/${trimmed}`;
}

/**
 * Given an upload / job response, pick the canonical reference a downstream
 * worker can consume. Prefers `object_key` (the raw S3 key), then a
 * normalized form of any `file_path` or `filename` the gateway emits.
 */
export function resolveStorageRef(response: IDataObject | undefined): string | undefined {
	if (!response) return undefined;
	const objectKey = response.object_key as string | undefined;
	if (objectKey) return objectKey;
	const objectUrl = response.object_url as string | undefined;
	if (objectUrl) return normalizeObjectKey(objectUrl);
	const filePath = response.file_path as string | undefined;
	if (filePath) return normalizeObjectKey(filePath);
	const filename = response.filename as string | undefined;
	if (filename) return normalizeObjectKey(filename);
	return undefined;
}

/**
 * Reusable property descriptor for the "Version Pinning" parameter group.
 * Every CUSTOM.* node exposes this collection so workflows can optionally
 * pin inputs to a deterministic MinIO VersionId or audit row. When the
 * collection is empty (default) the gateway auto-pins to the current
 * `VersionId` of each input at enqueue time.
 *
 * - `inputVersionId` pins the primary input (single-input endpoints).
 * - `inputAuditId`   pins via the `object_versions` row id instead.
 * - `inputVersionIds` is a UI collection that maps object-key → VersionId
 *   for multi-input endpoints (clash, diff). The Execute helper below
 *   converts it to the flat `input_version_ids` dict the gateway expects.
 */
export const versionPinningProperty = {
	displayName: 'Version Pinning (Optional)',
	name: 'versionPinning',
	type: 'collection' as const,
	default: {},
	placeholder: 'Add Pin',
	description: 'Pin inputs to a deterministic MinIO VersionId or audit ID. Leave empty to auto-pin to the current version at enqueue time.',
	options: [
		{
			displayName: 'Input Version ID',
			name: 'inputVersionId',
			type: 'string' as const,
			default: '',
			description:
				'MinIO VersionId to use for the primary input. Blank = auto-pin at gateway.',
			placeholder: 'e.g. 4f2a8c01-...-versioned',
		},
		{
			displayName: 'Input Audit ID',
			name: 'inputAuditId',
			type: 'number' as const,
			default: 0,
			description: 'Object_versions.ID of the version to pin. Alternative to Input Version ID. 0 = ignored.',
		},
		{
			displayName: 'Multi-Input Pins',
			name: 'inputVersionIdsUi',
			type: 'fixedCollection' as const,
			typeOptions: { multipleValues: true },
			default: {},
			description:
				'For multi-input endpoints (clash, diff). Map each referenced object key to a specific VersionId.',
			placeholder: 'Add Pin',
			options: [
				{
					name: 'pins',
					displayName: 'Pin',
					values: [
						{
							displayName: 'Object Key or Filename',
							name: 'key',
							type: 'string' as const,
							default: '',
							description: 'Either the raw object key (uploads/foo.ifc) or the exact filename used in the node',
						},
						{
							displayName: 'Version ID',
							name: 'versionId',
							type: 'string' as const,
							default: '',
							description: 'MinIO VersionId for this specific input',
						},
					],
				},
			],
		},
	],
};

/**
 * Reads the versionPinning collection from the current node parameters and
 * attaches the corresponding fields to a request body:
 *   - `input_version_id`  (string)
 *   - `input_audit_id`    (number)
 *   - `input_version_ids` (dict, string → string)
 * Missing / empty values are omitted so the gateway can apply its own
 * auto-pinning defaults.
 */
export function applyVersionPins(
	this: IExecuteFunctions,
	body: IDataObject,
	itemIndex: number,
	paramName: string = 'versionPinning',
): IDataObject {
	const pin = (this.getNodeParameter(paramName, itemIndex, {}) as IDataObject) || {};
	const vid = (pin.inputVersionId as string | undefined) || '';
	if (vid.trim()) {
		body.input_version_id = vid.trim();
	}
	const auditId = Number(pin.inputAuditId || 0);
	if (auditId > 0) {
		body.input_audit_id = auditId;
	}
	const multi = (pin.inputVersionIdsUi as IDataObject | undefined) || {};
	const entries = (multi.pins as Array<IDataObject> | undefined) || [];
	if (entries.length) {
		const map: Record<string, string> = {};
		for (const entry of entries) {
			const k = ((entry.key as string) || '').trim();
			const v = ((entry.versionId as string) || '').trim();
			if (k && v) map[k] = v;
		}
		if (Object.keys(map).length) {
			body.input_version_ids = map;
		}
	}
	return body;
}

/**
 * Helper to attach binary data to items for download operations.
 *
 * Routes the payload through n8n's binary-data manager
 * (`helpers.prepareBinaryData`) instead of stuffing base64 straight into the
 * item. With `N8N_DEFAULT_BINARY_DATA_MODE=filesystem` this writes the bytes to
 * disk and keeps only a reference in the execution data — so large IFC files no
 * longer inflate the in-memory runData (~1.33x as base64) or get serialized with
 * the execution. Must be called with the executing node's context bound as
 * `this` so it can reach the binary helpers.
 */
export async function handleBinaryData(
	this: IExecuteFunctions,
	items: INodeExecutionData[],
	propertyName: string,
	fileName: string,
	mimeType: string,
	data: Buffer,
): Promise<INodeExecutionData[]> {
	const binaryData = await this.helpers.prepareBinaryData(data, fileName, mimeType);

	return items.map((item) => ({
		json: {
			...item.json,
			fileName,
		},
		binary: {
			...(item.binary || {}),
			[propertyName]: binaryData,
		},
	}));
}

/**
 * Poll for job completion.
 */
export async function pollForJobCompletion(
	context: IExecuteFunctions,
	jobId: string,
	pollingInterval: number = 2,
	timeout: number = 300,
): Promise<any> {
	const startTime = Date.now();
	let jobCompleted = false;
	let jobStatus: any;

	while (!jobCompleted) {
		if ((Date.now() - startTime) / 1000 > timeout) {
			const progress = jobStatus?.progress;
			const progressHint = progress
				? ` Last progress: phase=${progress.phase ?? 'unknown'}, processed=${progress.processed ?? '?'}/${progress.total ?? '?'}, ${progress.percentage ?? '?'}%.`
				: '';
			throw new NodeOperationError(
				context.getNode(),
				`Job timeout exceeded after ${timeout} seconds.${progressHint}`,
			);
		}

		await new Promise((resolve) => setTimeout(resolve, pollingInterval * 1000));

		jobStatus = await ifcPipelineApiRequest.call(
			context,
			'GET',
			`/jobs/${jobId}/status`,
		);

		if (jobStatus.status === 'finished') {
			jobCompleted = true;
			return jobStatus;
		} else if (jobStatus.status === 'failed') {
			throw new NodeOperationError(
				context.getNode(),
				`Job failed: ${jobStatus.error || 'Unknown error'}`,
			);
		}
	}

	return jobStatus;
}

/**
 * Populate file-picker dropdowns from `/list_directories`. On object-storage
 * deployments the endpoint enumerates the bucket; an empty response means
 * the bucket is empty or the gateway is too old to list S3 objects — in
 * both cases we show a hint instead of a misleading error.
 */
export async function getFiles(
	this: ILoadOptionsFunctions,
	extensions?: string[],
): Promise<INodePropertyOptions[]> {
	try {
		const responseData = await ifcPipelineApiRequest.call(
			this,
			'GET',
			'/list_directories',
		);

		let files = (responseData.files as string[]) || [];

		if (extensions && extensions.length > 0) {
			files = files.filter((file: string) => {
				return extensions.some(ext => file.toLowerCase().endsWith(ext.toLowerCase()));
			});
		}

		if (files.length === 0) {
			return [
				{
					name: 'No files found in object storage',
					value: '',
					description: 'Upload a file first, or type the object key (e.g. uploads/model.ifc) in this field using an expression',
				},
			];
		}

		const options: INodePropertyOptions[] = files.map((file: string) => {
			const filename = file.split('/').pop() || file;
			const dir = file.substring(0, file.lastIndexOf('/')) || '/';
			return {
				name: file,
				value: file,
				description: `${filename} (in ${dir})`,
			};
		});

		options.sort((a, b) => a.name.localeCompare(b.name));

		return options;
	} catch (error) {
		return [
			{
				name: 'Error loading files',
				value: '',
				description: 'Failed to load files. Please check your API credentials and connection.',
			},
		];
	}
}
