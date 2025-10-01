import { IExecuteFunctions, ILoadOptionsFunctions } from 'n8n-workflow';
import { NodeConnectionType } from 'n8n-workflow';
import { INodeExecutionData, INodeType, INodeTypeDescription, INodePropertyOptions } from 'n8n-workflow';
import { ifcPipelineApiRequest, pollForJobCompletion, getFiles } from '../shared/GenericFunctions';

export class IfcToJson implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'IFC to JSON',
		name: 'ifcToJson',
		icon: 'file:ifctojson.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Convert IFC files to JSON format, for documentation see https://github.com/bimaps/ifc2json.',
		defaults: {
			name: 'IFC to JSON',
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
						name: 'Convert to JSON',
						value: 'convertToJson',
						description: 'Convert IFC file to JSON format',
						action: 'Convert IFC file to JSON format',
					},
					{
						name: 'Get JSON',
						value: 'getJson',
						description: 'Get a previously converted JSON file',
						action: 'Get a previously converted JSON file',
					},
				],
				default: 'convertToJson',
			},

			// Convert to JSON
			{
				displayName: 'IFC Filename Name or ID',
				name: 'filename',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getIfcFiles',
				},
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['convertToJson'],
					},
				},
				description: 'Select the IFC file to convert. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				placeholder: 'Select an IFC file...',
			},
			{
				displayName: 'Output Filename',
				name: 'outputFilename',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['convertToJson'],
					},
				},
				description: 'The name of the output JSON file',
				placeholder: '/output/json/Building-Architecture.json',
			},

			// Get JSON
			{
				displayName: 'Filename Name or ID',
				name: 'getFilename',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getJsonFiles',
				},
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['getJson'],
					},
				},
				description: 'Select the JSON file to retrieve. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				placeholder: 'Select a JSON file...',
			},
			{
				displayName: 'Wait for Completion',
				name: 'waitForCompletion',
				type: 'boolean',
				default: true,
				displayOptions: {
					show: {
						operation: ['convertToJson'],
					},
				},
				description: 'Whether to wait for the job to complete before continuing',
			},
			{
				displayName: 'Polling Interval (Seconds)',
				name: 'pollingInterval',
				type: 'number',
				default: 2,
				displayOptions: {
					show: {
						operation: ['convertToJson'],
						waitForCompletion: [true],
					},
				},
				description: 'How often to check the job status (in seconds)',
			},
			{
				displayName: 'Timeout (Seconds)',
				name: 'timeout',
				type: 'number',
				default: 300,
				displayOptions: {
					show: {
						operation: ['convertToJson'],
						waitForCompletion: [true],
					},
				},
				description: 'Maximum time to wait for job completion (in seconds)',
			},
		],
	};

	methods = {
		loadOptions: {
			// Get all available IFC files
			async getIfcFiles(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return await getFiles.call(this, ['.ifc']);
			},
			// Get all available JSON files
			async getJsonFiles(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return await getFiles.call(this, ['.json']);
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
				if (operation === 'convertToJson') {
					// Convert to JSON
					const filename = this.getNodeParameter('filename', i) as string;
					const outputFilename = this.getNodeParameter('outputFilename', i) as string;
					const waitForCompletion = this.getNodeParameter('waitForCompletion', i, true) as boolean;
					const pollingInterval = this.getNodeParameter('pollingInterval', i, 2) as number;
					const timeout = this.getNodeParameter('timeout', i, 300) as number;

					const body = {
						filename,
						output_filename: outputFilename,
					};

					// Submit the job
					responseData = await ifcPipelineApiRequest.call(
						this,
						'POST',
						'/ifc2json',
						body,
					);

					const jobId = responseData.job_id;

					// If waitForCompletion is true, poll for job status
					if (waitForCompletion && jobId) {
						responseData = await pollForJobCompletion(this, jobId, pollingInterval, timeout);
					}

					const executionData = this.helpers.constructExecutionMetaData(
						this.helpers.returnJsonArray(responseData as any),
						{ itemData: { item: i } },
					);

					returnData.push(...executionData);
				} else if (operation === 'getJson') {
					// Get JSON
					const filename = this.getNodeParameter('getFilename', i) as string;

					responseData = await ifcPipelineApiRequest.call(
						this,
						'GET',
						`/ifc2json/${filename}`,
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
