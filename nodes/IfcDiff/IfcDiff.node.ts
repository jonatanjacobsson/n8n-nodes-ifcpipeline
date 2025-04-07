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
		inputs: ['main'] as NodeConnectionType[] as NodeConnectionType[],
		outputs: ['main'] as NodeConnectionType[] as NodeConnectionType[],
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
			{
				displayName: 'Relationships',
				name: 'relationshipsUi',
				type: 'multiOptions',
				displayOptions: {
					show: {
						operation: ['compareIfcFiles'],
					},
				},
				options: [

					{
						name: 'Aggregate',
						value: 'aggregate',
						description: 'Check for differences in element aggregation',
					},
					{
						name: 'Attributes',
						value: 'attributes',
						description: 'Check for differences in element attributes',
					},
					{
						name: 'Classification',
						value: 'classification',
						description: 'Check for differences in element classifications',
					},
					{
						name: 'Container',
						value: 'container',
						description: 'Check for differences in spatial containment',
					},
					{
						name: 'Geometry',
						value: 'geometry',
						description: 'Check for differences in geometry (default)',
					},
					{
						name: 'Property Sets',
						value: 'property',
						description: 'Check for differences in property sets',
					},
					{
						name: 'Type',
						value: 'type',
						description: 'Check for differences in element types',
					},
				],
				default: ['geometry'], // Default to only checking geometry
				description: 'Select which relationships to compare. If none selected, defaults to geometry.',
			},
			{
				displayName: 'Is Shallow',
				name: 'isShallow',
				type: 'boolean',
				default: true,
				displayOptions: {
					show: {
						operation: ['compareIfcFiles'],
					},
				},
				description: 'Whether to stop comparison after the first difference is found for an element',
			},
			{
				displayName: 'Filter Elements',
				name: 'filterElements',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['compareIfcFiles'],
					},
				},
				placeholder: 'e.g., IfcWall',
				description: 'Optional IFC query to filter elements for comparison (e.g., IfcWall)',
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
					const relationships = (this.getNodeParameter('relationshipsUi', i, []) as { relationships: string[] }).relationships ?? [];
					const isShallow = this.getNodeParameter('isShallow', i, true) as boolean;
					const filterElements = this.getNodeParameter('filterElements', i, '') as string;

					const body: any = {
						old_file: oldFile,
						new_file: newFile,
						output_file: outputFile,
						is_shallow: isShallow,
					};

					// Only include relationships if it's not empty and not just ['geometry'] (which is the default handled by the backend if null)
					if (relationships.length > 0 && !(relationships.length === 1 && relationships[0] === 'geometry')) {
						body.relationships = relationships;
					}
					// Only include filter_elements if it's not an empty string
					if (filterElements) {
						body.filter_elements = filterElements;
					}

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