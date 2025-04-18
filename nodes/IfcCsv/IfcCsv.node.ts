import { IExecuteFunctions } from 'n8n-workflow';
import { NodeConnectionType } from 'n8n-workflow';
import { INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { ifcPipelineApiRequest } from '../shared/GenericFunctions';

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
				displayName: 'IFC Filename',
				name: 'filename',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['exportToCsv'],
					},
				},
				description: 'The name of the IFC file to export',
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
					},
				],
			},

			// Import from CSV
			{
				displayName: 'IFC Filename',
				name: 'ifcFilename',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['importFromCsv'],
					},
				},
				description: 'The name of the IFC file to import into',
			},
			{
				displayName: 'CSV Filename',
				name: 'csvFilename',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['importFromCsv'],
					},
				},
				description: 'The name of the CSV file to import',
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
			},
		],
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

					responseData = await ifcPipelineApiRequest.call(
						this,
						'POST',
						'/ifccsv',
						body,
					);

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

					const body: any = {
						ifc_filename: ifcFilename,
						csv_filename: csvFilename,
					};

					// Add output filename if provided
					if (outputFilename) {
						body.output_filename = outputFilename;
					}

					responseData = await ifcPipelineApiRequest.call(
						this,
						'POST',
						'/ifccsv/import',
						body,
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