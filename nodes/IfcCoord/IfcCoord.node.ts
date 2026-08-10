import { IExecuteFunctions, ILoadOptionsFunctions } from 'n8n-workflow';
import { NodeConnectionType } from 'n8n-workflow';
import {
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	INodePropertyOptions,
	NodeOperationError,
} from 'n8n-workflow';
import type { IDataObject } from 'n8n-workflow';
import { ifcPipelineApiRequest, getFiles } from '../shared/GenericFunctions';
import {
	executeItemsWithJobOrchestration,
	jobOrchestrationPropertiesForOperations,
	waitForJob,
} from '../shared/jobOrchestrationProperties';

export class IfcCoord implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'IFC Coordination',
		name: 'ifcCoord',
		icon: 'file:ifccoord.svg',
		group: ['transform'],
		version: 2,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Coordinate and auto-fix MEP clashes between two federated IFC models (ifccoord engine)',
		defaults: {
			name: 'IFC Coordination',
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
						name: 'Coordinate Clashes',
						value: 'coordinate',
						description: 'Detect, triage and (optionally) auto-fix clashes between two IFC models',
						action: 'Coordinate clashes between two IFC models',
					},
				],
				default: 'coordinate',
			},

			{
				displayName: 'File A Name or ID',
				name: 'pathA',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getIfcFiles',
				},
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['coordinate'],
					},
				},
				description: 'First federated IFC model (e.g. electrical). Choose from the list, or specify an object key using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				placeholder: 'uploads/elec.ifc',
			},
			{
				displayName: 'File B Name or ID',
				name: 'pathB',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getIfcFiles',
				},
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['coordinate'],
					},
				},
				description: 'Second federated IFC model (e.g. mechanical/structural). Choose from the list, or specify an object key using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				placeholder: 'uploads/mech.ifc',
			},
			{
				displayName: 'Mode',
				name: 'mode',
				type: 'options',
				options: [
					{
						name: 'Propose Only',
						value: 'propose_only',
						description: 'Record proposals without editing the IFCs',
					},
					{
						name: 'Propose and Apply',
						value: 'propose_and_apply',
						description: 'Apply gated fixes to work copies of the IFCs',
					},
				],
				default: 'propose_only',
				displayOptions: {
					show: {
						operation: ['coordinate'],
					},
				},
				description: 'Whether to only propose fixes or also apply the cleared ones',
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
						operation: ['coordinate'],
					},
				},
				options: [
					{
						displayName: 'Policy Path',
						name: 'policyPath',
						type: 'string',
						default: '',
						description: 'Policy JSON to use. Accepts a bundled scenario name (e.g. nobel_elec_vs_mech_route_global.json), an object key under uploads/, or an absolute path inside the worker.',
						placeholder: 'nobel_elec_vs_mech_route_global.json',
					},
					{
						displayName: 'Policy Inline (JSON)',
						name: 'policyInline',
						type: 'json',
						default: '',
						description: 'Inline policy JSON. Takes precedence over Policy Path when set.',
					},
					{
						displayName: 'Clash Options (JSON)',
						name: 'clashOptions',
						type: 'json',
						default: '',
						description: 'Custom clash_options override passed to the clash engine (e.g. {"mep_only": true})',
					},
					{
						displayName: 'Max Rounds',
						name: 'maxRounds',
						type: 'number',
						default: 10,
						description: 'Maximum coordination/fixing rounds',
					},
					{
						displayName: 'Max Auto Apply',
						name: 'maxAutoApply',
						type: 'number',
						default: 0,
						description: 'Hard cap of auto-applied fixes (0 = use policy default)',
					},
					{
						displayName: 'Output Subdirectory',
						name: 'outputSubdir',
						type: 'string',
						default: '',
						description: 'Custom output subdirectory name under output/coord (defaults to the case id)',
						placeholder: 'nobel_elec_vs_mech',
					},
				],
			},

			{
				displayName: 'Wait for Completion',
				name: 'waitForCompletion',
				type: 'boolean',
				default: true,
				displayOptions: {
					show: {
						operation: ['coordinate'],
					},
				},
				description: 'Whether to wait for the job to complete before continuing',
			},
			{
				displayName: 'Polling Interval (Seconds)',
				name: 'pollingInterval',
				type: 'number',
				default: 5,
				displayOptions: {
					show: {
						operation: ['coordinate'],
						waitForCompletion: [true],
					},
				},
				description: 'How often to check the job status (in seconds)',
			},
			{
				displayName: 'Timeout (Seconds)',
				name: 'timeout',
				type: 'number',
				default: 1800,
				displayOptions: {
					show: {
						operation: ['coordinate'],
						waitForCompletion: [true],
					},
				},
				description: 'Maximum time to wait for job completion (in seconds). Coordination on large models can take many minutes.',
			},
			...jobOrchestrationPropertiesForOperations(['coordinate']),
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
			if (operation === 'coordinate') {
				return runIfcCoord(this, itemIndex);
			}
			return {};
		});
	}
}

async function runIfcCoord(ctx: IExecuteFunctions, itemIndex: number): Promise<unknown> {
	const pathA = ctx.getNodeParameter('pathA', itemIndex) as string;
	const pathB = ctx.getNodeParameter('pathB', itemIndex) as string;
	const mode = ctx.getNodeParameter('mode', itemIndex) as string;
	const options = ctx.getNodeParameter('options', itemIndex, {}) as {
		policyPath?: string;
		policyInline?: string;
		clashOptions?: string;
		maxRounds?: number;
		maxAutoApply?: number;
		outputSubdir?: string;
	};
	const waitForCompletion = ctx.getNodeParameter('waitForCompletion', itemIndex, true) as boolean;

	const body: IDataObject = {
		path_a: pathA,
		path_b: pathB,
		mode,
	};

	if (options.policyPath) body.policy_path = options.policyPath;

	if (options.policyInline) {
		body.policy_inline = parseJsonParam(ctx, options.policyInline, 'Policy Inline (JSON)');
	}
	if (options.clashOptions) {
		body.clash_options = parseJsonParam(ctx, options.clashOptions, 'Clash Options (JSON)');
	}
	if (options.maxRounds !== undefined) body.max_rounds = options.maxRounds;
	if (options.maxAutoApply !== undefined && options.maxAutoApply > 0) {
		body.max_auto_apply = options.maxAutoApply;
	}
	if (options.outputSubdir) body.output_subdir = options.outputSubdir;

	const response = await ifcPipelineApiRequest.call(ctx, 'POST', '/ifccoord', body);
	const jobId = (response as { job_id?: string }).job_id;

	if (!waitForCompletion || !jobId) {
		return response;
	}

	return waitForJob(ctx, jobId, itemIndex, waitForCompletion);
}

/**
 * Parse a JSON parameter that may arrive as a string (raw JSON) or as an
 * already-parsed object (when the user supplied an n8n expression). Throws a
 * NodeOperationError with the field name on malformed JSON.
 */
function parseJsonParam(context: IExecuteFunctions, value: unknown, fieldName: string): any {
	if (value === null || value === undefined || value === '') return undefined;
	if (typeof value === 'object') return value;
	try {
		return JSON.parse(value as string);
	} catch (e) {
		throw new NodeOperationError(
			context.getNode(),
			`${fieldName} is not valid JSON: ${(e as Error).message}`,
		);
	}
}
