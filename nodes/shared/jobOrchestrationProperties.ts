import type { IDataObject, IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { ifcPipelineApiRequest, pollForJobCompletion } from './GenericFunctions';

export const jobOrchestrationProperties: INodeProperties[] = [
	{
		displayName: 'Execution Mode',
		name: 'executionMode',
		type: 'options',
		options: [
			{ name: 'Sequential', value: 'sequential' },
			{ name: 'Parallel', value: 'parallel' },
		],
		default: 'sequential',
		displayOptions: {
			show: {
				waitForCompletion: [true],
			},
		},
		description: 'Process multiple input items one at a time or concurrently when waiting for jobs',
	},
	{
		displayName: 'Max Concurrency',
		name: 'maxConcurrency',
		type: 'number',
		default: 5,
		displayOptions: {
			show: {
				waitForCompletion: [true],
				executionMode: ['parallel'],
			},
		},
		description: 'Maximum number of jobs to enqueue or poll in parallel',
	},
	{
		displayName: 'Max Retries Per Job',
		name: 'maxRetriesPerJob',
		type: 'number',
		default: 3,
		displayOptions: {
			show: {
				waitForCompletion: [true],
			},
		},
		description: 'RQ requeue attempts after a retryable failure (same job_id)',
	},
	{
		displayName: 'Retry Delay (Seconds)',
		name: 'retryDelaySeconds',
		type: 'number',
		default: 5,
		displayOptions: {
			show: {
				waitForCompletion: [true],
			},
		},
		description: 'Wait time before requeueing a failed job',
	},
];

export type JobOrchestrationParamNames = {
	waitForCompletion?: string;
	pollingInterval?: string;
	timeout?: string;
};

const DEFAULT_JOB_ORCHESTRATION_PARAMS: Required<JobOrchestrationParamNames> = {
	waitForCompletion: 'waitForCompletion',
	pollingInterval: 'pollingInterval',
	timeout: 'timeout',
};

function remapWaitShowCondition(
	show: Record<string, unknown>,
	waitParameterName?: string,
): Record<string, unknown> {
	if (!waitParameterName || waitParameterName === 'waitForCompletion') {
		return show;
	}
	const next = { ...show };
	if ('waitForCompletion' in next) {
		next[waitParameterName] = next.waitForCompletion;
		delete next.waitForCompletion;
	}
	return next;
}

export function jobOrchestrationPropertiesForOperations(
	operations: string[],
	propertyOverrides: Record<string, Partial<INodeProperties>> = {},
	waitParameterName?: string,
): INodeProperties[] {
	return jobOrchestrationProperties.map((prop) => {
		const override = propertyOverrides[prop.name as string] ?? {};
		const baseShow = remapWaitShowCondition(
			{ ...(prop.displayOptions?.show ?? {}) },
			waitParameterName,
		);
		const overrideShow = remapWaitShowCondition(
			{ ...(override.displayOptions?.show ?? {}) },
			waitParameterName,
		);
		return {
			...prop,
			...override,
			displayOptions: {
				show: {
					operation: operations,
					...baseShow,
					...overrideShow,
				},
			},
		};
	});
}

export function readJobOrchestrationOptions(
	context: IExecuteFunctions,
	itemIndex: number,
	waitForCompletion: boolean,
	paramNames: JobOrchestrationParamNames = {},
): {
	mode: 'sequential' | 'parallel';
	maxConcurrency: number;
	waitForCompletion: boolean;
	maxRetriesPerJob: number;
	retryDelaySeconds: number;
	pollingInterval: number;
	timeout: number;
} {
	const names = { ...DEFAULT_JOB_ORCHESTRATION_PARAMS, ...paramNames };
	const pollingInterval = context.getNodeParameter(names.pollingInterval, itemIndex, 2) as number;
	const timeout = context.getNodeParameter(names.timeout, itemIndex, 300) as number;

	if (!waitForCompletion) {
		return {
			mode: 'sequential',
			maxConcurrency: 1,
			waitForCompletion: false,
			maxRetriesPerJob: 0,
			retryDelaySeconds: 5,
			pollingInterval,
			timeout,
		};
	}

	return {
		mode: context.getNodeParameter('executionMode', itemIndex, 'sequential') as 'sequential' | 'parallel',
		maxConcurrency: context.getNodeParameter('maxConcurrency', itemIndex, 5) as number,
		waitForCompletion: true,
		maxRetriesPerJob: context.getNodeParameter('maxRetriesPerJob', itemIndex, 3) as number,
		retryDelaySeconds: context.getNodeParameter('retryDelaySeconds', itemIndex, 5) as number,
		pollingInterval,
		timeout,
	};
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPollTimeoutError(error: Error): boolean {
	return error.message.includes('Job timeout exceeded');
}

async function shouldRequeueAfterError(
	context: IExecuteFunctions,
	jobId: string,
	error: Error,
): Promise<boolean> {
	if (!isPollTimeoutError(error)) {
		return true;
	}
	const jobStatus = (await ifcPipelineApiRequest.call(
		context,
		'GET',
		`/jobs/${encodeURIComponent(jobId)}/status`,
	)) as IDataObject;
	const status = String(jobStatus.status ?? '');
	// Poll budget exhausted while the worker is still running — not retryable.
	if (status === 'started' || status === 'queued' || status === 'deferred') {
		return false;
	}
	return true;
}

async function runWithConcurrency<T>(
	tasks: Array<() => Promise<T>>,
	limit: number,
): Promise<T[]> {
	const results: T[] = new Array(tasks.length);
	let nextIndex = 0;

	async function worker(): Promise<void> {
		while (nextIndex < tasks.length) {
			const index = nextIndex;
			nextIndex += 1;
			results[index] = await tasks[index]();
		}
	}

	const workerCount = Math.max(1, Math.min(limit, tasks.length));
	await Promise.all(Array.from({ length: workerCount }, () => worker()));

	return results;
}

export async function waitForJob(
	context: IExecuteFunctions,
	jobId: string,
	itemIndex: number,
	waitForCompletion: boolean = true,
	paramNames: JobOrchestrationParamNames = {},
): Promise<IDataObject> {
	const options = readJobOrchestrationOptions(context, itemIndex, waitForCompletion, paramNames);
	if (!options.waitForCompletion) {
		return { job_id: jobId };
	}

	const maxAttempts = Math.max(1, options.maxRetriesPerJob + 1);
	let lastError: Error | undefined;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			return (await pollForJobCompletion(
				context,
				jobId,
				options.pollingInterval,
				options.timeout,
			)) as IDataObject;
		} catch (error) {
			lastError = error as Error;
			if (attempt >= maxAttempts) {
				break;
			}
			if (!(await shouldRequeueAfterError(context, jobId, lastError))) {
				break;
			}
			await sleep(Math.max(0, options.retryDelaySeconds) * 1000);
			await ifcPipelineApiRequest.call(
				context,
				'POST',
				`/jobs/${encodeURIComponent(jobId)}/requeue`,
			);
		}
	}

	throw lastError ?? new NodeOperationError(context.getNode(), `Job ${jobId} failed`);
}

export async function executeItemsWithJobOrchestration(
	context: IExecuteFunctions,
	items: INodeExecutionData[],
	runItem: (itemIndex: number) => Promise<unknown>,
	paramNames: JobOrchestrationParamNames = {},
): Promise<INodeExecutionData[][]> {
	const returnData: INodeExecutionData[] = [];
	const names = { ...DEFAULT_JOB_ORCHESTRATION_PARAMS, ...paramNames };
	const waitForCompletion = context.getNodeParameter(names.waitForCompletion, 0, true) as boolean;
	const orchestration = readJobOrchestrationOptions(context, 0, waitForCompletion, names);

	const processOne = async (itemIndex: number): Promise<INodeExecutionData[]> => {
		try {
			const response = await runItem(itemIndex);
			return context.helpers.constructExecutionMetaData(
				context.helpers.returnJsonArray(response as IDataObject),
				{ itemData: { item: itemIndex } },
			);
		} catch (error) {
			if (context.continueOnFail()) {
				return context.helpers.constructExecutionMetaData(
					context.helpers.returnJsonArray({ error: (error as Error).message }),
					{ itemData: { item: itemIndex } },
				);
			}
			throw error;
		}
	};

	if (orchestration.mode === 'parallel' && items.length > 1) {
		const limit = Math.max(1, orchestration.maxConcurrency);
		const batches = await runWithConcurrency(
			items.map((_, itemIndex) => () => processOne(itemIndex)),
			limit,
		);
		for (const batch of batches) {
			returnData.push(...batch);
		}
	} else {
		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			returnData.push(...(await processOne(itemIndex)));
		}
	}

	return [returnData];
}
