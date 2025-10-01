import { IExecuteFunctions, ILoadOptionsFunctions } from 'n8n-workflow';
import { INodeExecutionData, INodeType, INodeTypeDescription, NodeConnectionType, INodePropertyOptions } from 'n8n-workflow';
import { handleBinaryData, ifcPipelineApiRequest, ifcPipelineApiRequestDownload, ifcPipelineApiRequestUpload, getFiles } from '../shared/GenericFunctions';
import { NodeOperationError } from 'n8n-workflow';

export class IfcPipeline implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'IfcPipeline File Operations',
		name: 'ifcPipeline',
		icon: 'file:ifcpipeline.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Work with files in IFC Pipeline',
		defaults: {
			name: 'File Operations',
		},
		inputs: ['main'] as NodeConnectionType[],
		outputs: ['main'] as NodeConnectionType[],
		credentials: [
			{
				name: 'ifcPipelineApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Create Viewer Link',
						value: 'createViewerLink',
						description: 'Create a preview link for IFC Viewer',
						action: 'Create a preview link for ifc viewer',
					},
					{
						name: 'Download File',
						value: 'downloadFile',
						description: 'Download a file from IFC Pipeline',
						action: 'Download a file from ifc pipeline',
					},
					{
						name: 'Download From URL',
						value: 'downloadFromUrl',
						description: 'Download a file from a URL to IFC Pipeline',
						action: 'Download a file from a url to ifc pipeline',
					},
					{
						name: 'Get Job Status',
						value: 'getJobStatus',
						description: 'Get the status of a job in IFC Pipeline',
						action: 'Get the status of a job in ifc pipeline',
					},
					{
						name: 'List Directories',
						value: 'listDirectories',
						description: 'List available directories and files',
						action: 'List available directories and files',
					},
					{
						name: 'Upload File',
						value: 'uploadFile',
						description: 'Upload a file to IFC Pipeline',
						action: 'Upload a file to ifc pipeline',
					},
				],
				default: 'listDirectories',
			},

			// List Directories
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: {
					show: {
						operation: ['listDirectories'],
					},
				},
				options: [],
			},

			// Create Viewer Link
			{
				displayName: 'File Path Name or ID',
				name: 'filePath',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getAllFiles',
				},
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['createViewerLink'],
					},
				},
				description: 'Select the file to create a viewer link for. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				placeholder: 'Select a file...',
			},

			// Upload File
			{
				displayName: 'File Type',
				name: 'fileType',
				type: 'options',
				required: true,
				displayOptions: {
					show: {
						operation: ['uploadFile'],
					},
				},
				options: [
					{
						name: 'IFC',
						value: 'ifc',
					},
					{
						name: 'IDS',
						value: 'ids',
					},
					{
						name: 'CSV',
						value: 'csv',
					},
					{
						name: 'Other',
						value: 'other',
					},
				],
				default: 'ifc',
				description: 'The type of file to upload',
			},
			{
				displayName: 'Binary Property',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				displayOptions: {
					show: {
						operation: ['uploadFile'],
					},
				},
				description: 'Name of the binary property that contains the file data to upload',
			},

			// Download File
			{
				displayName: 'File Path Name or ID',
				name: 'filePath',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getAllFiles',
				},
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['downloadFile'],
					},
				},
				description: 'Select the file to download. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				placeholder: 'Select a file...',
			},
			{
				displayName: 'Binary Property',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				displayOptions: {
					show: {
						operation: ['downloadFile'],
					},
				},
				description: 'Name of the binary property to which to write the data of the downloaded file',
			},

			// Download From URL
			{
				displayName: 'URL',
				name: 'url',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['downloadFromUrl'],
					},
				},
				description: 'URL of the file to download',
				placeholder: 'https://example.com/model.ifc',
			},
			{
				displayName: 'Filename',
				name: 'outputFilename',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['downloadFromUrl'],
					},
				},
				description: 'Optional: Custom filename for the downloaded file. If not provided, the original filename from the URL will be used.',
				placeholder: 'Building-Architecture.ifc',
			},

			// Get Job Status
			{
				displayName: 'Job ID',
				name: 'jobId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['getJobStatus'],
					},
				},
				description: 'ID of the job to get status for',
				placeholder: '123e4567-e89b-12d3-a456-426614174000',
			},
		],
	};

	methods = {
		loadOptions: {
			// Get all available files (no filter)
			async getAllFiles(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return await getFiles.call(this);
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		let responseData;
		const returnData: INodeExecutionData[] = [];

		const operation = this.getNodeParameter('operation', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				if (operation === 'listDirectories') {
					// List directories
					responseData = await ifcPipelineApiRequest.call(
						this,
						'GET',
						'/list_directories',
					);

					const executionData = this.helpers.constructExecutionMetaData(
						this.helpers.returnJsonArray(responseData as any),
						{ itemData: { item: i } },
					);

					returnData.push(...executionData);
				} else if (operation === 'createViewerLink') {
					// Create viewer link
					const filePath = this.getNodeParameter('filePath', i) as string;

					responseData = await ifcPipelineApiRequest.call(
						this,
						'POST',
						'/create_download_link',
						{
							file_path: filePath,
						},
					);

					const executionData = this.helpers.constructExecutionMetaData(
						this.helpers.returnJsonArray(responseData as any),
						{ itemData: { item: i } },
					);

					returnData.push(...executionData);
				} else if (operation === 'uploadFile') {
					// Upload file
					const fileType = this.getNodeParameter('fileType', i) as string;
					const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;

					if (items[i].binary === undefined) {
						throw new NodeOperationError(this.getNode(), 'No binary data exists on item!', {
							itemIndex: i,
						});
					}

					const item = items[i];

					if (!item.binary || !item.binary[binaryPropertyName]) {
						throw new NodeOperationError(
							this.getNode(),
							`No binary data exists on item in property "${binaryPropertyName}"!`,
							{ itemIndex: i },
						);
					}

					const binaryData = item.binary[binaryPropertyName];
					const dataBuffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);

					const formData: any = {
						file: {
							value: dataBuffer,
							options: {
								filename: binaryData.fileName || 'file',
								contentType: binaryData.mimeType,
							},
						},
					};

					responseData = await ifcPipelineApiRequestUpload.call(
						this,
						'POST',
						`/upload/${fileType}`,
						formData,
					);

					const executionData = this.helpers.constructExecutionMetaData(
						this.helpers.returnJsonArray(responseData as any),
						{ itemData: { item: i } },
					);

					returnData.push(...executionData);
				} else if (operation === 'downloadFile') {
					// Download file
					const filePath = this.getNodeParameter('filePath', i) as string;
					const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;

					// First create a download link
					const linkResponse = await ifcPipelineApiRequest.call(
						this,
						'POST',
						'/create_download_link',
						{
							file_path: filePath,
						},
					);

					// Now download the file using the token
					const token = linkResponse.token;
					const { data } = await ifcPipelineApiRequestDownload.call(
						this,
						'GET',
						`/download/${token}`,
					);

					// Extract the filename from the path
					const pathParts = filePath.split('/');
					const fileName = pathParts[pathParts.length - 1];

					// Determine mime type based on file extension
					let mimeType = 'application/octet-stream';
					if (fileName.endsWith('.ifc')) {
						mimeType = 'application/x-step';
					} else if (fileName.endsWith('.ids')) {
						mimeType = 'application/xml';
					} else if (fileName.endsWith('.csv')) {
						mimeType = 'text/csv';
					} else if (fileName.endsWith('.json')) {
						mimeType = 'application/json';
					}

					const newItems = handleBinaryData(
						[items[i]],
						binaryPropertyName,
						fileName,
						mimeType,
						data as Buffer,
					);

					const executionData = this.helpers.constructExecutionMetaData(
						newItems,
						{ itemData: { item: i } },
					);

					returnData.push(...executionData);
				} else if (operation === 'downloadFromUrl') {
					// Download from URL
					const url = this.getNodeParameter('url', i) as string;
					const outputFilename = this.getNodeParameter('outputFilename', i, '') as string;

					const requestBody: { url: string; output_filename?: string } = { url };

					// Only add output_filename to the request if it's not empty
					if (outputFilename) {
						requestBody.output_filename = outputFilename;
					}

					responseData = await ifcPipelineApiRequest.call(
						this,
						'POST',
						'/download-from-url',
						requestBody,
					);

					const executionData = this.helpers.constructExecutionMetaData(
						this.helpers.returnJsonArray(responseData as any),
						{ itemData: { item: i } },
					);

					returnData.push(...executionData);
				} else if (operation === 'getJobStatus') {
					// Get job status
					const jobId = this.getNodeParameter('jobId', i) as string;

					responseData = await ifcPipelineApiRequest.call(
						this,
						'GET',
						`/jobs/${jobId}/status`,
					);

					const executionData = this.helpers.constructExecutionMetaData(
						this.helpers.returnJsonArray(responseData as any),
						{ itemData: { item: i } },
					);

					returnData.push(...executionData);
				}
			} catch (error) {
				if (this.continueOnFail()) {
					const executionErrorData = this.helpers.constructExecutionMetaData(
						this.helpers.returnJsonArray({ error: error.message }),
						{ itemData: { item: i } },
					);
					returnData.push(...executionErrorData);
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
