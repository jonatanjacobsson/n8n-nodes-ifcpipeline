import { IExecuteFunctions } from 'n8n-workflow';
import { INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { ifcPipelineApiRequest } from '../shared/GenericFunctions';

export class IfcCoord implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'IFC Clash Coordination',
		name: 'ifcCoord',
		icon: 'file:ifccoord.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Coordinate and automatically fix spatial clashes between IFC models',
		defaults: {
			name: 'IFC Clash Coordination',
		},
		inputs: ['main'],
		outputs: ['main'],
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
						name: 'Run Coordination',
						value: 'runCoordination',
						description: 'Coordinate and resolve clashes between two IFC models',
						action: 'Run coordination between two IFC models',
					},
				],
				default: 'runCoordination',
			},

			// Run Coordination - Path A & B
			{
				displayName: 'Path A (File name under /uploads)',
				name: 'pathA',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['runCoordination'],
					},
				},
				description: 'The filename of model A (e.g. E1.ifc)',
			},
			{
				displayName: 'Path B (File name under /uploads)',
				name: 'pathB',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['runCoordination'],
					},
				},
				description: 'The filename of model B (e.g. M1.ifc)',
			},
			{
				displayName: 'Mode',
				name: 'mode',
				type: 'options',
				options: [
					{
						name: 'Propose Only',
						value: 'propose_only',
						description: 'Detect clashes and prepare proposals without modifying the IFC file',
					},
					{
						name: 'Propose and Apply',
						value: 'propose_and_apply',
						description: 'Detect and automatically apply accepted fixes to the IFC file',
					},
				],
				default: 'propose_only',
				displayOptions: {
					show: {
						operation: ['runCoordination'],
					},
				},
				description: 'Coordination mode',
			},
			{
				displayName: 'Policy Path',
				name: 'policyPath',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['runCoordination'],
					},
				},
				description: 'Optional path to custom policy JSON inside /uploads or scenarios',
			},
			{
				displayName: 'Policy Inline JSON',
				name: 'policyInlineJson',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['runCoordination'],
					},
				},
				description: 'Optional inline policy JSON string (overrides policy path if specified)',
			},
			{
				displayName: 'Output Subdirectory',
				name: 'outputSubdir',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['runCoordination'],
					},
				},
				description: 'Optional custom subdirectory name under /output/coord',
			},

			// Additional Options
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: {
					show: {
						operation: ['runCoordination'],
					},
				},
				options: [
					{
						displayName: 'Max Rounds',
						name: 'maxRounds',
						type: 'number',
						default: 10,
						description: 'Maximum coordination rounds to perform',
					},
					{
						displayName: 'Max Auto Apply',
						name: 'maxAutoApply',
						type: 'number',
						default: 25,
						description: 'Hard cap of auto-applied fixes',
					},
					{
						displayName: 'Clash Options JSON',
						name: 'clashOptionsJson',
						type: 'string',
						default: '',
						description: 'Optional custom clash options override as a JSON string',
					},
				],
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
				if (operation === 'runCoordination') {
					const pathA = this.getNodeParameter('pathA', i) as string;
					const pathB = this.getNodeParameter('pathB', i) as string;
					const mode = this.getNodeParameter('mode', i) as string;
					const policyPath = this.getNodeParameter('policyPath', i) as string;
					const policyInlineJson = this.getNodeParameter('policyInlineJson', i) as string;
					const outputSubdir = this.getNodeParameter('outputSubdir', i) as string;
					
					const options = this.getNodeParameter('options', i) as {
						maxRounds?: number;
						maxAutoApply?: number;
						clashOptionsJson?: string;
					};

					const body: any = {
						path_a: pathA,
						path_b: pathB,
						mode,
					};

					if (policyPath) {
						body.policy_path = policyPath;
					}
					
					if (policyInlineJson) {
						try {
							body.policy_inline = JSON.parse(policyInlineJson);
						} catch (e) {
							throw new Error('Policy Inline JSON is not valid JSON: ' + e.message);
						}
					}

					if (outputSubdir) {
						body.output_subdir = outputSubdir;
					}

					if (options.maxRounds !== undefined) {
						body.max_rounds = options.maxRounds;
					}

					if (options.maxAutoApply !== undefined) {
						body.max_auto_apply = options.maxAutoApply;
					}

					if (options.clashOptionsJson) {
						try {
							body.clash_options = JSON.parse(options.clashOptionsJson);
						} catch (e) {
							throw new Error('Clash Options JSON is not valid JSON: ' + e.message);
						}
					}

					responseData = await ifcPipelineApiRequest.call(
						this,
						'POST',
						'/ifccoord',
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
