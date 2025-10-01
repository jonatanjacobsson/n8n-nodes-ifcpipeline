import { IExecuteFunctions, ILoadOptionsFunctions } from 'n8n-workflow';
import { NodeConnectionType } from 'n8n-workflow';
import { INodeExecutionData, INodeType, INodeTypeDescription, INodePropertyOptions } from 'n8n-workflow';
import { ifcPipelineApiRequest, pollForJobCompletion, getFiles } from '../shared/GenericFunctions';

export class IfcCsv implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'IFC CSV',
		name: 'ifcCsv',
		icon: 'file:ifccsv.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Convert IFC to CSV and import CSV data into IF, for documentation see Ifcopenshell.C',
		defaults: {
			name: 'IFC CSV',
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
						name: 'Export to CSV',
						value: 'exportToCsv',
						description: 'Export IFC data to CSV format',
						action: 'Export IFC data to CSV format',
					},
					{
						name: 'Import From CSV',
						value: 'importFromCsv',
						description: 'Import CSV data into IFC file',
						action: 'Import CSV data into IFC file',
					},
				],
				default: 'exportToCsv',
			},

			// Export to CSV
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
						operation: ['exportToCsv'],
					},
				},
				description: 'Select the IFC file to export. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
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
						operation: ['exportToCsv'],
					},
				},
				description: 'The name of the output CSV file',
				placeholder: '/output/csv/Building-Architecture_export.csv',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: {
					show: {
						operation: ['exportToCsv'],
					},
				},
				options: [
					{
						displayName: 'Attributes',
						name: 'attributes',
						type: 'string',
						default: 'Name,Description',
						description: 'Comma-separated list of attributes to include in the CSV file',
					},
					{
						displayName: 'Delimiter',
						name: 'delimiter',
						type: 'string',
						default: ',',
						description: 'The delimiter to use for the CSV file',
					},
					{
						displayName: 'Format',
						name: 'format',
						type: 'options',
						options: [
							{
								name: 'CSV',
								value: 'csv',
							},
							{
								name: 'Excel',
								value: 'xlsx',
							},
						],
						default: 'csv',
						description: 'The output format',
					},
					{
						displayName: 'Null Value',
						name: 'null',
						type: 'string',
						default: '-',
						description: 'The value to use for null values',
					},
					{
						displayName: 'Query',
						name: 'query',
						type: 'string',
						default: 'IfcProduct',
						description: 'The query to filter the IFC data',
						hint: 'Use IfcOpenShell <a href="https://docs.ifcopenshell.org/ifcopenshell-python/selector_syntax.html#filtering-elements" target="_blank">selector syntax</a> to filter elements (e.g., IfcWall, IfcBeam, .Pset_WallCommon.LoadBearing=TRUE)',
					},
				],
			},

			// Import from CSV
			{
				displayName: 'IFC Filename Name or ID',
				name: 'ifcFilename',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getIfcFiles',
				},
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['importFromCsv'],
					},
				},
				description: 'Select the IFC file to import into. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				placeholder: 'Select an IFC file...',
			},
			{
				displayName: 'CSV Filename Name or ID',
				name: 'csvFilename',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getCsvFiles',
				},
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['importFromCsv'],
					},
				},
				description: 'Select the CSV file to import. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				placeholder: 'Select a CSV file...',
			},
			{
				displayName: 'Output Filename',
				name: 'outputFilename',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['importFromCsv'],
					},
				},
				description: 'The name of the output IFC file. If left empty, the original file will be overwritten.',
				placeholder: '/output/ifc/Building-Architecture_updated.ifc',
			},
			{
				displayName: 'Wait for Completion',
				name: 'waitForCompletion',
				type: 'boolean',
				default: true,
				displayOptions: {
					show: {
						operation: ['exportToCsv', 'importFromCsv'],
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
						operation: ['exportToCsv', 'importFromCsv'],
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
						operation: ['exportToCsv', 'importFromCsv'],
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
			// Get all available CSV files
			async getCsvFiles(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return await getFiles.call(this, ['.csv', '.xlsx']);
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
				if (operation === 'exportToCsv') {
					// Export to CSV
					const filename = this.getNodeParameter('filename', i) as string;
					const outputFilename = this.getNodeParameter('outputFilename', i) as string;
					const options = this.getNodeParameter('options', i) as {
						format?: string;
						delimiter?: string;
						null?: string;
						query?: string;
						attributes?: string;
					};
					const waitForCompletion = this.getNodeParameter('waitForCompletion', i, true) as boolean;
					const pollingInterval = this.getNodeParameter('pollingInterval', i, 2) as number;
					const timeout = this.getNodeParameter('timeout', i, 300) as number;

					const body: any = {
						filename,
						output_filename: outputFilename,
					};

					// Add optional parameters
					if (options.format) body.format = options.format;
					if (options.delimiter) body.delimiter = options.delimiter;
					if (options.null) body.null = options.null;
					if (options.query) body.query = options.query;

					// Convert comma-separated attributes to array
					if (options.attributes) {
						body.attributes = options.attributes.split(',').map(attr => attr.trim());
					}

					// Submit the job
					responseData = await ifcPipelineApiRequest.call(
						this,
						'POST',
						'/ifccsv',
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
				} else if (operation === 'importFromCsv') {
					// Import from CSV
					const ifcFilename = this.getNodeParameter('ifcFilename', i) as string;
					const csvFilename = this.getNodeParameter('csvFilename', i) as string;
					const outputFilename = this.getNodeParameter('outputFilename', i) as string;
					const waitForCompletion = this.getNodeParameter('waitForCompletion', i, true) as boolean;
					const pollingInterval = this.getNodeParameter('pollingInterval', i, 2) as number;
					const timeout = this.getNodeParameter('timeout', i, 300) as number;

					const body: any = {
						ifc_filename: ifcFilename,
						csv_filename: csvFilename,
					};

					// Add output filename if provided
					if (outputFilename) {
						body.output_filename = outputFilename;
					}

					// Submit the job
					responseData = await ifcPipelineApiRequest.call(
						this,
						'POST',
						'/ifccsv/import',
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
