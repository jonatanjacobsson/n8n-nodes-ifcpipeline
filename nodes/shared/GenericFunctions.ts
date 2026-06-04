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

	try {
		return await this.helpers.requestWithAuthentication.call(this, 'ifcPipelineApi', options as any);
	} catch (error) {
		throw new NodeApiError(this.getNode(), error);
	}
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

	try {
		const response = await this.helpers.requestWithAuthentication.call(this, 'ifcPipelineApi', options as any);
		return {
			data: response,
		};
	} catch (error) {
		throw new NodeApiError(this.getNode(), error);
	}
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

	try {
		return await this.helpers.requestWithAuthentication.call(this, 'ifcPipelineApi', options as any);
	} catch (error) {
		throw new NodeApiError(this.getNode(), error);
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
 * Helper to attach binary data to items for download operations.
 */
export function handleBinaryData(
	items: INodeExecutionData[],
	propertyName: string,
	fileName: string,
	mimeType: string,
	data: Buffer,
): INodeExecutionData[] {
	const newItems: INodeExecutionData[] = [];

	for (const item of items) {
		const newItem = {
			json: {
				...item.json,
				fileName,
			},
			binary: {
				...(item.binary || {}),
			},
		};

		newItem.binary![propertyName] = {
			data: data.toString('base64'),
			mimeType,
			fileName,
		};

		newItems.push(newItem);
	}

	return newItems;
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
			throw new NodeOperationError(
				context.getNode(),
				`Job timeout exceeded after ${timeout} seconds`,
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
