import { IExecuteFunctions } from 'n8n-workflow';
import { NodeConnectionType } from 'n8n-workflow';
import { INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { ifcPipelineApiRequest } from '../shared/GenericFunctions';

export class IfcDiff implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'IFC Diff',
		name: 'ifcDiff',
		icon: 'file:ifcdiff.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Compare different versions of IFC files, for documentation see Ifcopenshell.',
		defaults: {
			name: 'IFC Diff',
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
						name: 'Compare IFC Files',
						value: 'compareIfcFiles',
						description: 'Compare different versions of IFC files',
						action: 'Compare different versions of IFC files',
					},
				],
				default: 'compareIfcFiles',
			},

			// Compare IFC Files
			{
				displayName: 'Old File',
				name: 'oldFile',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['compareIfcFiles'],
					},
				},
				description: 'The name of the old IFC file',
			},
			{
				displayName: 'New File',
				name: 'newFile',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['compareIfcFiles'],
					},
				},
				description: 'The name of the new IFC file',
			},
			{
				displayName: 'Output File',
				name: 'outputFile',
				type: 'string',
				default: 'diff.json',
				displayOptions: {
					show: {
						operation: ['compareIfcFiles'],
					},
				},
				description: 'The name of the output file',
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
				if (operation === 'compareIfcFiles') {
					// Compare IFC Files
					const oldFile = this.getNodeParameter('oldFile', i) as string;
					const newFile = this.getNodeParameter('newFile', i) as string;
					const outputFile = this.getNodeParameter('outputFile', i) as string;

					const body = {
						old_file: oldFile,
						new_file: newFile,
						output_file: outputFile,
					};

					responseData = await ifcPipelineApiRequest.call(
						this,
						'POST',
						'/ifcdiff',
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