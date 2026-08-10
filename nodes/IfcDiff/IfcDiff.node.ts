import type { IExecuteFunctions, ILoadOptionsFunctions } from 'n8n-workflow';
import type { NodeConnectionType } from 'n8n-workflow';
import type { INodeExecutionData, INodeType, INodeTypeDescription, INodePropertyOptions } from 'n8n-workflow';
import { getFiles } from '../shared/GenericFunctions';
import { executeItemsWithJobOrchestration } from '../shared/jobOrchestrationProperties';
import { ifcDiffOperations, ifcDiffProperties, runIfcDiff } from './resources/ifcdiff';

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
				options: ifcDiffOperations,
				default: 'compareIfcFiles',
			},
			...ifcDiffProperties,
		],
	};

	methods = {
		loadOptions: {
			async getIfcFiles(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return await getFiles.call(this, ['.ifc']);
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		return executeItemsWithJobOrchestration(this, items, async (itemIndex) => {
			const operation = this.getNodeParameter('operation', itemIndex) as string;
			if (operation === 'compareIfcFiles') {
				return runIfcDiff(this, itemIndex);
			}
			return {};
		});
	}
}
