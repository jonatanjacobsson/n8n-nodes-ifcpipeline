import {
	IExecuteFunctions,
	IHookFunctions,
	IDataObject,
	INodeExecutionData,
	NodeApiError,
	IRequestOptions,
	IHttpRequestMethods,
} from 'n8n-workflow';

/**
 * Make an API request to IFC Pipeline
 */
export async function ifcPipelineApiRequest(
	this: IHookFunctions | IExecuteFunctions,
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
		return await this.helpers.requestWithAuthentication.call(this, 'ifcPipelineApi', options);
	} catch (error) {
		throw new NodeApiError(this.getNode(), error);
	}
}

/**
 * Make an API request to download a file
 */
export async function ifcPipelineApiRequestDownload(
	this: IHookFunctions | IExecuteFunctions,
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
	};

	if (!Object.keys(body).length) {
		delete options.body;
	}

	if (!Object.keys(qs).length) {
		delete options.qs;
	}

	try {
		const response = await this.helpers.requestWithAuthentication.call(this, 'ifcPipelineApi', options);
		return {
			data: response,
		};
	} catch (error) {
		throw new NodeApiError(this.getNode(), error);
	}
}

/**
 * Make an API request to upload a file
 */
export async function ifcPipelineApiRequestUpload(
	this: IHookFunctions | IExecuteFunctions,
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
		return await this.helpers.requestWithAuthentication.call(this, 'ifcPipelineApi', options);
	} catch (error) {
		throw new NodeApiError(this.getNode(), error);
	}
}

/**
 * Helper function to format an IFC file name with required path if needed
 */
export function formatFileName(fileName: string): string {
	if (fileName.startsWith('/') || fileName.includes('://')) {
		return fileName;
	}
	return `/app/uploads/${fileName}`;
}

/**
 * Helper to handle file binary data
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