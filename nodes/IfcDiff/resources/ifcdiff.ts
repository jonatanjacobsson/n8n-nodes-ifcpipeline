import type {
	IExecuteFunctions,
	IDataObject,
	INodeProperties,
	INodePropertyOptions,
} from 'n8n-workflow';
import { ifcPipelineApiRequest } from '../../shared/GenericFunctions';
import {
	jobOrchestrationPropertiesForOperations,
	waitForJob,
} from '../../shared/jobOrchestrationProperties';

export const ifcDiffOperations: INodePropertyOptions[] = [
	{
		name: 'Compare IFC Files',
		value: 'compareIfcFiles',
		description: 'Compare different versions of IFC files',
		action: 'Compare different versions of IFC files',
	},
];

export const ifcDiffProperties: INodeProperties[] = [
	{
		displayName: 'Old File Name or ID',
		name: 'oldFile',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getIfcFiles',
		},
		default: '',
		required: true,
		displayOptions: {
			show: {
				operation: ['compareIfcFiles'],
			},
		},
		description:
			'Select the old IFC file from available files. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		placeholder: 'Select an IFC file...',
	},
	{
		displayName: 'Old Version ID (Previous Upload)',
		name: 'oldVersionId',
		type: 'string',
		default: '',
		displayOptions: {
			show: {
				operation: ['compareIfcFiles'],
			},
		},
		description:
			'SeaweedFS/S3 VersionId for the previous file revision. Required when Old File and New File are the same object key (typical SharePoint v(N-1) → v(N) shallow diff). Leave blank only if the two paths point at different keys.',
		placeholder: 'e.g. 67486e6a8ef29b9fc814e5bdffb52663',
		hint: 'Nobel / file-versions subflow: turn on expressions and set to {{ $json.data[0].old_version_id }}',
	},
	{
		displayName: 'New File Name or ID',
		name: 'newFile',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getIfcFiles',
		},
		default: '',
		required: true,
		displayOptions: {
			show: {
				operation: ['compareIfcFiles'],
			},
		},
		description:
			'Select the new IFC file from available files. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		placeholder: 'Select an IFC file...',
	},
	{
		displayName: 'New Version ID (Latest Upload)',
		name: 'newVersionId',
		type: 'string',
		default: '',
		displayOptions: {
			show: {
				operation: ['compareIfcFiles'],
			},
		},
		description:
			'SeaweedFS/S3 VersionId for the latest file revision. Pair with Old Version ID when both file fields reference the same uploads/ key.',
		placeholder: 'e.g. 67486e6a74d53c016e0295206da40c2f',
		hint: 'Nobel / file-versions subflow: turn on expressions and set to {{ $json.data[0].new_version_id }}',
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
		placeholder: 'output/diff/comparison_report.json',
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
				description: 'Check for differences in geometry (can be slow for large models)',
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
		default: ['geometry'],
		description:
			'Select which relationships to compare. Only the selected types will be checked. For faster comparisons, exclude geometry.',
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
		placeholder: 'IfcWall',
		description: 'Optional IFC query to filter elements for comparison (e.g., IfcWall)',
		hint: 'Use IfcOpenShell <a href="https://docs.ifcopenshell.org/ifcopenshell-python/selector_syntax.html#filtering-elements" target="_blank">selector syntax</a> to filter elements (e.g., IfcWall, IfcBeam, .Pset_WallCommon.LoadBearing=TRUE)',
	},
	{
		displayName: 'Wait for Completion',
		name: 'waitForCompletion',
		type: 'boolean',
		default: true,
		displayOptions: {
			show: {
				operation: ['compareIfcFiles'],
			},
		},
		description: 'Whether to wait for the job to complete before continuing',
	},
	{
		displayName: 'Polling Interval (Seconds)',
		name: 'pollingInterval',
		type: 'number',
		default: 2,
		displayOptions: {
			show: {
				operation: ['compareIfcFiles'],
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
				operation: ['compareIfcFiles'],
				waitForCompletion: [true],
			},
		},
		description: 'Maximum time to wait for job completion (in seconds)',
	},
	...jobOrchestrationPropertiesForOperations(['compareIfcFiles'], {
		maxConcurrency: { default: 3 },
	}),
];

function applyDiffVersionPins(body: IDataObject, ctx: IExecuteFunctions, itemIndex: number): void {
	const oldVersionId = (ctx.getNodeParameter('oldVersionId', itemIndex, '') as string).trim();
	const newVersionId = (ctx.getNodeParameter('newVersionId', itemIndex, '') as string).trim();
	if (oldVersionId) {
		body.old_version_id = oldVersionId;
	}
	if (newVersionId) {
		body.new_version_id = newVersionId;
	}
}

export async function runIfcDiff(
	ctx: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const oldFile = ctx.getNodeParameter('oldFile', itemIndex) as string;
	const newFile = ctx.getNodeParameter('newFile', itemIndex) as string;
	const outputFile = ctx.getNodeParameter('outputFile', itemIndex) as string;
	const relationships = ctx.getNodeParameter('relationshipsUi', itemIndex, []) as string[];
	const isShallow = ctx.getNodeParameter('isShallow', itemIndex, true) as boolean;
	const filterElements = ctx.getNodeParameter('filterElements', itemIndex, '') as string;
	const waitForCompletion = ctx.getNodeParameter('waitForCompletion', itemIndex, true) as boolean;

	const body: IDataObject = {
		old_file: oldFile,
		new_file: newFile,
		output_file: outputFile,
		is_shallow: isShallow,
		relationships: relationships.length > 0 ? relationships : ['geometry'],
	};

	if (filterElements) {
		body.filter_elements = filterElements;
	}

	applyDiffVersionPins(body, ctx, itemIndex);

	const response = (await ifcPipelineApiRequest.call(ctx, 'POST', '/ifcdiff', body)) as IDataObject;
	const jobId = (response.job_id as string | undefined)?.trim();
	if (!waitForCompletion || !jobId) {
		return response;
	}

	return waitForJob(ctx, jobId, itemIndex, waitForCompletion);
}
