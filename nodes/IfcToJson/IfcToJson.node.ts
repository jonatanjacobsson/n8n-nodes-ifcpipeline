import { IExecuteFunctions } from 'n8n-workflow';
import { NodeConnectionType } from 'n8n-workflow';
import { INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { ifcPipelineApiRequest } from '../shared/GenericFunctions';

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
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
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
				displayName: 'IFC Filename',
				name: 'filename',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['convertToJson'],
					},
				},
				description: 'The name of the IFC file to convert',
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
			},

			// Get JSON
			{
				displayName: 'Filename',
				name: 'getFilename',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['getJson'],
					},
				},
				description: 'The name of the JSON file to retrieve',
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
				if (operation === 'convertToJson') {
					// Convert to JSON
					const filename = this.getNodeParameter('filename', i) as string;
					const outputFilename = this.getNodeParameter('outputFilename', i) as string;

					const body = {
						filename,
						output_filename: outputFilename,
					};

					responseData = await ifcPipelineApiRequest.call(
						this,
						'POST',
						'/ifc2json',
						body,
					);

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