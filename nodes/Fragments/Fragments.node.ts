import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import type { NodeConnectionType } from 'n8n-workflow';
import { executeItemsWithJobOrchestration } from '../shared/jobOrchestrationProperties';
import {
	fragmentsOperations,
	fragmentsProperties,
	runFragments,
} from './resources/fragments';

export class Fragments implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Fragments',
		name: 'fragments',
		icon: 'file:ifcpipeline.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Generate or ensure ThatOpen .frag previews via ifcpipeline',
		defaults: {
			name: 'Fragments',
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
				options: fragmentsOperations,
				default: 'ensure',
			},
			...fragmentsProperties,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		return executeItemsWithJobOrchestration(this, items, async (itemIndex) => {
			const operation = this.getNodeParameter('operation', itemIndex) as string;
			return runFragments(this, operation, itemIndex);
		});
	}
}
