import type {
	IExecuteFunctions,
	IDataObject,
	INodeProperties,
	INodePropertyOptions,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { ifcPipelineApiRequest } from '../../shared/GenericFunctions';
import {
	jobOrchestrationPropertiesForOperations,
	waitForJob,
} from '../../shared/jobOrchestrationProperties';

export const fragmentsOperations: INodePropertyOptions[] = [
	{
		name: 'Generate',
		value: 'generate',
		description: 'POST /fragments — enqueue IFC → .frag conversion',
		action: 'Generate fragments',
	},
	{
		name: 'Ensure',
		value: 'ensure',
		description: 'GET /fragments/{filename} — return existing .frag or enqueue on first request',
		action: 'Ensure fragments exist',
	},
	{
		name: 'Get Job Status',
		value: 'status',
		description: 'GET /jobs/{job_id}/status — poll RQ job result',
		action: 'Get job status',
	},
];

export const fragmentsWaitProperties: INodeProperties[] = [
	{
		displayName: 'Wait for Completion',
		name: 'waitForCompletion',
		type: 'boolean',
		default: true,
		displayOptions: {
			show: {
				operation: ['generate', 'ensure'],
			},
		},
		description: 'Whether to wait for the RQ job to complete before continuing',
	},
	{
		displayName: 'Polling Interval (Seconds)',
		name: 'pollingInterval',
		type: 'number',
		default: 2,
		displayOptions: {
			show: {
				operation: ['generate', 'ensure'],
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
				operation: ['generate', 'ensure'],
				waitForCompletion: [true],
			},
		},
		description: 'Maximum time to wait for job completion (in seconds)',
	},
];

export const fragmentsProperties: INodeProperties[] = [
	{
		displayName: 'Input Filename',
		name: 'inputFilename',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'uploads/model.ifc',
		description: 'S3 key or uploads/ path for the source IFC (Generate only)',
		displayOptions: {
			show: {
				operation: ['generate'],
			},
		},
	},
	{
		displayName: 'Output Filename',
		name: 'outputFilename',
		type: 'string',
		default: '',
		placeholder: 'model.frag',
		description: 'Optional output name under output/frag/ (defaults from input basename)',
		displayOptions: {
			show: {
				operation: ['generate'],
			},
		},
	},
	{
		displayName: 'Input Version ID',
		name: 'inputVersionId',
		type: 'string',
		default: '',
		description: 'Optional MinIO VersionId pin for the source IFC',
		displayOptions: {
			show: {
				operation: ['generate'],
			},
		},
	},
	{
		displayName: 'Filename',
		name: 'filename',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'model.ifc or model.frag',
		description: 'IFC or .frag basename used by GET /fragments/{filename}',
		displayOptions: {
			show: {
				operation: ['ensure'],
			},
		},
	},
	{
		displayName: 'Input Version ID',
		name: 'ensureInputVersionId',
		type: 'string',
		default: '',
		description: 'Optional query param input_version_id when lazy-enqueueing',
		displayOptions: {
			show: {
				operation: ['ensure'],
			},
		},
	},
	{
		displayName: 'Job ID',
		name: 'jobId',
		type: 'string',
		default: '',
		required: true,
		description: 'RQ job ID from Generate or Ensure (when status is generating)',
		displayOptions: {
			show: {
				operation: ['status'],
			},
		},
	},
	...fragmentsWaitProperties,
	...jobOrchestrationPropertiesForOperations(['generate', 'ensure'], {
		maxConcurrency: { default: 4 },
	}),
];

function encodeFragmentPath(filename: string): string {
	return encodeURIComponent(filename).replace(/%2F/g, '/');
}

async function waitForFragmentsJob(
	ctx: IExecuteFunctions,
	response: IDataObject,
	itemIndex: number,
): Promise<IDataObject> {
	const waitForCompletion = ctx.getNodeParameter('waitForCompletion', itemIndex, true) as boolean;
	if (!waitForCompletion) {
		return response;
	}

	const jobId = (response.job_id as string | undefined)?.trim();
	if (!jobId) {
		return response;
	}

	return waitForJob(ctx, jobId, itemIndex, waitForCompletion);
}

export async function runFragments(
	ctx: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<unknown> {
	if (operation === 'generate') {
		const inputFilename = ctx.getNodeParameter('inputFilename', i) as string;
		if (!inputFilename.trim()) {
			throw new NodeOperationError(ctx.getNode(), 'Input Filename is required', { itemIndex: i });
		}
		const body: IDataObject = {
			input_filename: inputFilename.trim(),
		};
		const outputFilename = (ctx.getNodeParameter('outputFilename', i) as string).trim();
		if (outputFilename) body.output_filename = outputFilename;
		const inputVersionId = (ctx.getNodeParameter('inputVersionId', i) as string).trim();
		if (inputVersionId) body.input_version_id = inputVersionId;

		let response = (await ifcPipelineApiRequest.call(
			ctx,
			'POST',
			'/fragments',
			body,
		)) as IDataObject;

		response = await waitForFragmentsJob(ctx, response, i);
		return response;
	}

	if (operation === 'ensure') {
		const filename = (ctx.getNodeParameter('filename', i) as string).trim();
		if (!filename) {
			throw new NodeOperationError(ctx.getNode(), 'Filename is required', { itemIndex: i });
		}
		const qs: Record<string, string> = {};
		const inputVersionId = (ctx.getNodeParameter('ensureInputVersionId', i) as string).trim();
		if (inputVersionId) qs.input_version_id = inputVersionId;
		const encoded = encodeFragmentPath(filename);

		let response = (await ifcPipelineApiRequest.call(
			ctx,
			'GET',
			`/fragments/${encoded}`,
			{},
			qs,
		)) as IDataObject;

		if (response.status === 'generating') {
			response = await waitForFragmentsJob(ctx, response, i);

			const waitForCompletion = ctx.getNodeParameter('waitForCompletion', i, true) as boolean;
			if (waitForCompletion && response.status === 'finished') {
				response = (await ifcPipelineApiRequest.call(
					ctx,
					'GET',
					`/fragments/${encoded}`,
					{},
					qs,
				)) as IDataObject;
			}
		}

		return response;
	}

	if (operation === 'status') {
		const jobId = (ctx.getNodeParameter('jobId', i) as string).trim();
		if (!jobId) {
			throw new NodeOperationError(ctx.getNode(), 'Job ID is required', { itemIndex: i });
		}
		return ifcPipelineApiRequest.call(
			ctx,
			'GET',
			`/jobs/${encodeURIComponent(jobId)}/status`,
		);
	}

	throw new NodeOperationError(ctx.getNode(), `Unknown fragments operation: ${operation}`, {
		itemIndex: i,
	});
}
