import { IExecuteFunctions, ILoadOptionsFunctions } from 'n8n-workflow';
import { NodeConnectionType } from 'n8n-workflow';
import {
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	INodePropertyOptions,
	NodeOperationError,
} from 'n8n-workflow';
import {
	ifcPipelineApiRequest,
	getFiles,
	applyVersionPins,
	versionPinningProperty,
} from '../shared/GenericFunctions';
import {
	executeItemsWithJobOrchestration,
	jobOrchestrationPropertiesForOperations,
	waitForJob,
	type JobOrchestrationParamNames,
} from '../shared/jobOrchestrationProperties';

const INGEST_JOB_ORCHESTRATION_PARAMS: JobOrchestrationParamNames = {
	waitForCompletion: 'ingestWaitForCompletion',
	pollingInterval: 'ingestPollingInterval',
	timeout: 'ingestTimeout',
};

/**
 * Normalize a node parameter into a clean string array. Accepts a real array
 * (multiOptions / expression), a single string, or a comma/newline-separated
 * string. Blank entries are dropped and surrounding whitespace trimmed.
 */
function toStringArray(value: unknown): string[] {
	// Flatten arrays AND split each entry on commas/newlines. This makes all of
	// these resolve to the same 1:1 list (VersionIds never contain commas):
	//   ["a","b"]            → [a, b]
	//   "a,b"                → [a, b]
	//   ["a,b,c"]            → [a, b, c]   (single comma-joined item)
	//   expression → array   → flattened
	const raw = Array.isArray(value) ? value : [value];
	const out: string[] = [];
	for (const entry of raw) {
		if (entry === null || entry === undefined) continue;
		for (const part of String(entry).split(/[\n,]/)) {
			const trimmed = part.trim();
			if (trimmed) out.push(trimmed);
		}
	}
	return out;
}

/**
 * Resolve the file list from the primary (array) parameter, falling back to a
 * legacy singular value so workflows saved before multi-file support keep
 * working. Single bare strings stay intact (file keys may contain commas only
 * in pathological cases; multiOptions and expressions cover the array path).
 */
function toFileArray(primary: unknown, legacy: unknown): string[] {
	if (Array.isArray(primary)) {
		const arr = primary
			.map((v) => (v === null || v === undefined ? '' : String(v).trim()))
			.filter((v) => v.length > 0);
		if (arr.length) return arr;
	} else if (typeof primary === 'string' && primary.trim().length) {
		return [primary.trim()];
	}
	if (typeof legacy === 'string' && legacy.trim().length) {
		return [legacy.trim()];
	}
	return [];
}

/**
 * Map files[idx] → versionIds[idx] into the pin dict, keyed by the exact file
 * string. Blank/missing version entries are skipped (auto-pin at gateway).
 */
function zipVersionPins(
	target: Record<string, string>,
	files: string[],
	versionIds: string[],
): void {
	for (let idx = 0; idx < files.length; idx++) {
		const vid = (versionIds[idx] || '').trim();
		if (vid) {
			target[files[idx]] = vid;
		}
	}
}

const MAX_INGEST_ERROR_LEN = 500;

function truncateIngestError(value: unknown): string {
	const text = String(value ?? '').trim();
	if (!text) return 'TopologicPy ingest job failed';
	return text.length > MAX_INGEST_ERROR_LEN
		? `${text.slice(0, MAX_INGEST_ERROR_LEN)}…`
		: text;
}

function sanitizeIngestResponse(data: IDataObject): IDataObject {
	const out: IDataObject = { ...data };
	if (typeof out.error === 'string') {
		out.error = truncateIngestError(out.error);
	}
	if (typeof out.cde_registration_error === 'string') {
		out.cde_registration_error = truncateIngestError(out.cde_registration_error);
	}
	return out;
}

export class TopologicPy implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'TopologicPy',
		name: 'topologicPy',
		icon: 'file:topologicpy-logo.png',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'TopologicPy spatial analysis: room-stamp, graph ingest (spaces, spatial, MEP, structural)',
		defaults: {
			name: 'TopologicPy',
		},
		inputs: ['main'] as NodeConnectionType[],
		outputs: ['main'] as NodeConnectionType[],
		credentials: [
			{
				name: 'ifcPipelineApi',
				required: true,
			},
			{
				name: 'httpHeaderAuth',
				required: false,
				displayOptions: {
					show: {
						operation: ['ingest'],
						ingestRegisterCde: [true],
					},
				},
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
						name: 'Roomstamp',
						value: 'roomstamp',
						description: 'Match elements to rooms/zones and optionally stamp property sets',
						action: 'Match elements to rooms and optionally stamp IFC property sets',
					},
					{
						name: 'Ingest',
						value: 'ingest',
						description: 'Extract graph relationships from IFC using discipline-specific scripts',
						action: 'Extract graph relationships for CDE Graph Studio',
					},
				],
				default: 'roomstamp',
			},

			// Spatial Files (one or many)
			{
				displayName: 'Spatial File Names or IDs',
				name: 'spatialFiles',
				type: 'multiOptions',
				typeOptions: {
					loadOptionsMethod: 'getIfcFiles',
				},
				default: [],
				required: true,
				displayOptions: {
					show: {
						operation: ['roomstamp'],
					},
				},
				description: 'Architecture/spatial IFC files containing IfcSpace and optional IfcZone data. Rooms from all selected files are merged into one candidate pool. Pick one or more from the list, or supply an array of object keys using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},

			// Element Files (one or many)
			{
				displayName: 'Element File Names or IDs',
				name: 'elementFiles',
				type: 'multiOptions',
				typeOptions: {
					loadOptionsMethod: 'getIfcFiles',
				},
				default: [],
				required: true,
				displayOptions: {
					show: {
						operation: ['roomstamp'],
					},
				},
				description: 'MEP/target IFC files containing elements to classify or stamp. Each file is processed and stamped independently (one output per file). Pick one or more from the list, or supply an array of object keys using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},

			// Stamp toggle
			{
				displayName: 'Stamp Elements',
				name: 'stamp',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						operation: ['roomstamp'],
					},
				},
				description: 'Whether to write matched room/zone values into target IFC property sets and output stamped IFC copies',
			},

			// Options collection
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: {
					show: {
						operation: ['roomstamp'],
					},
				},
				options: [
					{
						displayName: 'Element Query',
						name: 'elementQuery',
						type: 'string',
						default: 'IfcElement',
						description: 'IfcOpenShell selector query for target elements',
					},
					{
						displayName: 'Space Query',
						name: 'spaceQuery',
						type: 'string',
						default: 'IfcSpace',
						description: 'IfcOpenShell selector query for room/space candidates',
					},
					{
						displayName: 'Engine',
						name: 'engine',
						type: 'options',
						options: [
							{ name: 'Auto', value: 'auto', description: 'Use TopologicPy if available, fallback to BBox' },
							{ name: 'BBox Only', value: 'bbox', description: 'Bounding-box containment only' },
							{ name: 'TopologicPy', value: 'topologicpy', description: 'Force TopologicPy (fails if unavailable)' },
						],
						default: 'auto',
						description: 'Topology engine to use for containment checks',
					},
					{
						displayName: 'Sample Strategy',
						name: 'sampleStrategy',
						type: 'options',
						options: [
							{ name: 'Placement', value: 'placement', description: 'Use element ObjectPlacement origin' },
							{ name: 'BBox Centroid', value: 'bbox_centroid', description: 'Use bounding-box center' },
						],
						default: 'placement',
						description: 'Point used to classify target elements against spaces',
					},
					{
						displayName: 'Include Zones',
						name: 'includeZones',
						type: 'boolean',
						default: true,
						description: 'Whether to include IfcZone assignments in report/stamps',
					},
					{
						displayName: 'Report Detail',
						name: 'reportDetail',
						type: 'options',
						options: [
							{ name: 'Summary', value: 'summary' },
							{ name: 'Full', value: 'full', description: 'Include per-element results' },
						],
						default: 'summary',
						description: 'Level of detail in the JSON report',
					},
					{
						displayName: 'Stamp Ambiguous',
						name: 'stampAmbiguous',
						type: 'boolean',
						default: false,
						description: 'Whether to stamp elements that match multiple spaces (picks closest)',
					},
					{
						displayName: 'Property Set Name',
						name: 'psetName',
						type: 'string',
						default: 'Pset_IfcPipelineRoomStamp',
						description: 'Property set name used when stamping elements',
					},
					{
						displayName: 'Output File',
						name: 'outputFile',
						type: 'string',
						default: 'topology_roomstamp_report.json',
						description: 'JSON report output filename',
					},
					{
						displayName: 'Output IFC Prefix',
						name: 'outputIfcPrefix',
						type: 'string',
						default: '',
						description: 'Optional output path/prefix for stamped IFC files under output/topology/',
					},
					{
						displayName: 'Max Elements',
						name: 'maxElements',
						type: 'number',
						default: 0,
						description: 'Cap on elements to process (0 = unlimited). Useful for sampling large models.',
					},
					{
						displayName: 'Tolerance',
						name: 'tolerance',
						type: 'number',
						default: 0.01,
						description: 'Containment tolerance in model units',
					},
					{
						displayName: 'Cell Mode',
						name: 'cellMode',
						type: 'options',
						options: [
							{ name: 'Prism (Fast)', value: 'prism', description: 'BBox prism cells — production default' },
							{ name: 'Mesh (Slow)', value: 'mesh', description: 'IfcOpenShell triangle mesh cells — debug only' },
						],
						default: 'prism',
						description: 'How room TopologicPy cells are built',
					},
					{
						displayName: 'Distance Mode',
						name: 'distanceMode',
						type: 'options',
						options: [
							{ name: 'BBox (Fast)', value: 'bbox', description: 'BBox distance for ambiguous/unmatched resolution' },
							{ name: 'TopologicPy', value: 'topologic', description: 'Vertex.Distance — slower, use for QA' },
						],
						default: 'bbox',
						description: 'How ambiguous and unmatched elements pick the nearest room',
					},
					{
						displayName: 'Max Proximate Spaces',
						name: 'maxProximateSpaces',
						type: 'number',
						default: 32,
						description: 'Cap nearest-room candidates for unmatched elements (lower = faster)',
					},
				],
			},

			// ─── Ingest operation parameters ───────────────────────────────
			{
				displayName: 'Ingest Script',
				name: 'ingestScript',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getIngestScripts',
				},
				default: 'ExtractSpaces',
				required: true,
				displayOptions: {
					show: {
						operation: ['ingest'],
					},
				},
				description: 'Discipline-specific ingest script to run. Scripts are discovered dynamically with full parameter documentation — hover for details.',
			},
			{
				displayName: 'Input Files',
				name: 'ingestInputFiles',
				type: 'multiOptions',
				typeOptions: {
					loadOptionsMethod: 'getIfcFiles',
				},
				default: [],
				required: true,
				displayOptions: {
					show: {
						operation: ['ingest'],
					},
				},
				description: 'IFC files to process with the selected ingest script',
			},
			{
				displayName: 'Arguments',
				name: 'ingestArguments',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				displayOptions: {
					show: {
						operation: ['ingest'],
					},
				},
				description: 'Arguments to pass to the ingest script. Add values in order matching the script parameters (shown in the script dropdown description). Values are auto-coerced to the correct type.',
				placeholder: 'Add Argument',
				options: [
					{
						name: 'argumentValues',
						displayName: 'Argument',
						values: [
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								description: 'Argument value (positional, in __init__ parameter order)',
								placeholder: 'Enter argument value',
							},
						],
					},
				],
			},
			{
				displayName: 'Register in CDE',
				name: 'ingestRegisterCde',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						operation: ['ingest'],
					},
				},
				description: 'Whether to POST extracted relationships to the CDE graph ingest endpoint after extraction',
			},
			{
				displayName: 'CDE Base URL',
				name: 'ingestCdeBaseUrl',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['ingest'],
						ingestRegisterCde: [true],
					},
				},
				description: 'CDE API base URL (e.g. https://nobelhub-api.byggstyrning.se)',
				placeholder: 'https://nobelhub-api.byggstyrning.se',
			},
			{
				displayName: 'CDE Project ID',
				name: 'ingestCdeProjectId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['ingest'],
						ingestRegisterCde: [true],
					},
				},
				description: 'CDE Project UUID for graph relationship registration',
			},
			{
				displayName: 'CDE Revision Ref',
				name: 'ingestCdeRevisionRef',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['ingest'],
						ingestRegisterCde: [true],
					},
				},
				description:
					'Model revision ref for Graph Studio (e.g. fv:<file-version-uuid>). Required so relationships attach to the selected IFC model.',
				placeholder: 'fv:46b8143b-cadd-4004-a5b7-f07cff250411',
			},
			{
				displayName: 'Output File Name',
				name: 'ingestOutputFile',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['ingest'],
					},
				},
				description: 'Optional output filename override (defaults to auto-generated)',
			},
			{
				displayName: 'Wait for Completion',
				name: 'ingestWaitForCompletion',
				type: 'boolean',
				default: true,
				displayOptions: {
					show: {
						operation: ['ingest'],
					},
				},
				description: 'Whether to wait for the ingest job to complete before continuing',
			},
			{
				displayName: 'Polling Interval (Seconds)',
				name: 'ingestPollingInterval',
				type: 'number',
				default: 5,
				displayOptions: {
					show: {
						operation: ['ingest'],
						ingestWaitForCompletion: [true],
					},
				},
				description: 'How often to check the job status (in seconds)',
			},
			{
				displayName: 'Timeout (Seconds)',
				name: 'ingestTimeout',
				type: 'number',
				default: 7200,
				displayOptions: {
					show: {
						operation: ['ingest'],
						ingestWaitForCompletion: [true],
					},
				},
				description: 'Maximum time to wait for job completion (default 2h)',
			},

			// ─── Version pinning ──────────────────────────────────────────────
			// Version pinning (single primary pin / audit id / manual key→version map)
			{
				...versionPinningProperty,
				displayOptions: {
					show: {
						operation: ['roomstamp', 'ingest'],
					},
				},
			},

			// Per-file version IDs aligned 1:1 with the file arrays above. These
			// are zipped into the gateway's `input_version_ids` map (keyed by the
			// exact object key sent), so each spatial/element file can pin its own
			// MinIO VersionId. Use the manual list or supply an array via expression.
			{
				displayName: 'Spatial Version IDs',
				name: 'spatialVersionIds',
				type: 'string',
				typeOptions: {
					multipleValues: true,
				},
				default: [],
				displayOptions: {
					show: {
						operation: ['roomstamp'],
					},
				},
				description: 'Optional MinIO VersionIds aligned 1:1 with Spatial Files (index 0 → first spatial file, etc.). Leave an entry blank to auto-pin that file. Add items manually, or supply an array via an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				placeholder: 'Add Version ID',
			},
			{
				displayName: 'Element Version IDs',
				name: 'elementVersionIds',
				type: 'string',
				typeOptions: {
					multipleValues: true,
				},
				default: [],
				displayOptions: {
					show: {
						operation: ['roomstamp'],
					},
				},
				description: 'Optional MinIO VersionIds aligned 1:1 with Element Files (index 0 → first element file, etc.). Leave an entry blank to auto-pin that file. Add items manually, or supply an array via an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				placeholder: 'Add Version ID',
			},

			// Job orchestration
			{
				displayName: 'Wait for Completion',
				name: 'waitForCompletion',
				type: 'boolean',
				default: true,
				displayOptions: {
					show: {
						operation: ['roomstamp'],
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
						operation: ['roomstamp'],
						waitForCompletion: [true],
					},
				},
				description: 'How often to check the job status (in seconds)',
			},
			{
				displayName: 'Timeout (Seconds)',
				name: 'timeout',
				type: 'number',
				default: 14400,
				displayOptions: {
					show: {
						operation: ['roomstamp'],
						waitForCompletion: [true],
					},
				},
				description: 'Maximum time to wait for job completion in seconds (default 4h for large federated models)',
			},
			...jobOrchestrationPropertiesForOperations(['roomstamp'], {
				maxConcurrency: { default: 3 },
			}),
			...jobOrchestrationPropertiesForOperations(
				['ingest'],
				{ maxConcurrency: { default: 3 } },
				'ingestWaitForCompletion',
			),
		],
	};

	methods = {
		loadOptions: {
			async getIfcFiles(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return await getFiles.call(this, ['.ifc']);
			},
			async getIngestScripts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				try {
					const response = await ifcPipelineApiRequest.call(
						this,
						'GET',
						'/topologicpy/ingest/scripts',
						{},
					);
					const scripts = (response as any).scripts || [];

					return scripts.map((script: any) => {
						const params = script.parameters || [];
						const paramCount = params.length;
						const paramInfo = paramCount > 0 ? ` (${paramCount} param${paramCount > 1 ? 's' : ''})` : '';

						let description = script.description || `Run the ${script.name} ingest script`;

						if (params.length > 0) {
							description += '<br><br><b>Parameters:</b>';
							params.forEach((param: any) => {
								const required = param.required ? ' <i>(required)</i>' : '';
								const defaultValue = param.default !== undefined && param.default !== null
									? ` <code>[default: ${param.default}]</code>` : '';
								const paramType = param.type ? ` <code>{${param.type}}</code>` : '';
								description += `<br>• <b>${param.name}</b>${paramType}${required}${defaultValue}`;
								if (param.description) {
									description += `<br>&nbsp;&nbsp;${param.description}`;
								}
							});
						}

						return {
							name: `${script.name}${paramInfo}`,
							value: script.name,
							description,
						};
					});
				} catch {
					return [
						{ name: 'ExtractSpaces', value: 'ExtractSpaces', description: 'Extract IfcSpace geometry, storey containment, and zone memberships' },
						{ name: 'SpatialContainment', value: 'SpatialContainment', description: 'Extract element-to-space containment using TopologicPy spatial graph' },
						{ name: 'MepTopology', value: 'MepTopology', description: 'Extract MEP distribution system topology (flow connections, ports)' },
						{ name: 'StructuralConnectivity', value: 'StructuralConnectivity', description: 'Extract structural connectivity graph (member connections, load paths)' },
					];
				}
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const operation = this.getNodeParameter('operation', 0) as string;
		const orchestrationParams =
			operation === 'ingest' ? INGEST_JOB_ORCHESTRATION_PARAMS : undefined;

		return executeItemsWithJobOrchestration(
			this,
			items,
			async (itemIndex) => {
				if (operation === 'ingest') {
					return runTopologicIngest(this, itemIndex);
				}
				return runTopologicRoomstamp(this, itemIndex);
			},
			orchestrationParams,
		);
	}
}

async function runTopologicRoomstamp(
	ctx: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const spatialFiles = toFileArray(
		ctx.getNodeParameter('spatialFiles', itemIndex, []),
		ctx.getNodeParameter('spatialFile', itemIndex, '') as unknown,
	);
	const elementFiles = toFileArray(
		ctx.getNodeParameter('elementFiles', itemIndex, []),
		ctx.getNodeParameter('elementFile', itemIndex, '') as unknown,
	);
	const spatialVersionIds = toStringArray(
		ctx.getNodeParameter('spatialVersionIds', itemIndex, []),
	);
	const elementVersionIds = toStringArray(
		ctx.getNodeParameter('elementVersionIds', itemIndex, []),
	);
	const stamp = ctx.getNodeParameter('stamp', itemIndex) as boolean;
	const options = ctx.getNodeParameter('options', itemIndex, {}) as {
		elementQuery?: string;
		spaceQuery?: string;
		engine?: string;
		sampleStrategy?: string;
		includeZones?: boolean;
		reportDetail?: string;
		stampAmbiguous?: boolean;
		psetName?: string;
		outputFile?: string;
		outputIfcPrefix?: string;
		maxElements?: number;
		tolerance?: number;
		cellMode?: string;
		distanceMode?: string;
		maxProximateSpaces?: number;
	};
	const waitForCompletion = ctx.getNodeParameter('waitForCompletion', itemIndex, true) as boolean;

	if (!spatialFiles.length) {
		throw new NodeOperationError(ctx.getNode(), 'At least one spatial file is required', { itemIndex });
	}
	if (!elementFiles.length) {
		throw new NodeOperationError(ctx.getNode(), 'At least one element file is required', { itemIndex });
	}

	const body: IDataObject = {
		spatial_files: spatialFiles,
		element_files: elementFiles,
		stamp,
	};

	if (options.elementQuery) body.element_query = options.elementQuery;
	if (options.spaceQuery) body.space_query = options.spaceQuery;
	if (options.engine) body.engine = options.engine;
	if (options.sampleStrategy) body.sample_strategy = options.sampleStrategy;
	if (options.includeZones !== undefined) body.include_zones = options.includeZones;
	if (options.reportDetail) body.report_detail = options.reportDetail;
	if (options.stampAmbiguous !== undefined) body.stamp_ambiguous = options.stampAmbiguous;
	if (options.psetName) body.pset_name = options.psetName;
	if (options.outputFile) body.output_file = options.outputFile;
	if (options.outputIfcPrefix) body.output_ifc_prefix = options.outputIfcPrefix;
	if (options.maxElements && options.maxElements > 0) body.max_elements = options.maxElements;
	if (options.tolerance !== undefined) body.tolerance = options.tolerance;
	if (options.cellMode) body.cell_mode = options.cellMode;
	if (options.distanceMode) body.distance_mode = options.distanceMode;
	if (options.maxProximateSpaces && options.maxProximateSpaces > 0) {
		body.max_proximate_spaces = options.maxProximateSpaces;
	}

	applyVersionPins.call(ctx, body, itemIndex);

	const perFilePins: Record<string, string> = {
		...((body.input_version_ids as Record<string, string>) || {}),
	};
	zipVersionPins(perFilePins, spatialFiles, spatialVersionIds);
	zipVersionPins(perFilePins, elementFiles, elementVersionIds);
	if (Object.keys(perFilePins).length) {
		body.input_version_ids = perFilePins;
	}

	const response = (await ifcPipelineApiRequest.call(
		ctx,
		'POST',
		'/topologicpy/roomstamp',
		body,
	)) as IDataObject;
	const jobId = (response.job_id as string | undefined)?.trim();
	if (!waitForCompletion || !jobId) {
		return response;
	}

	return waitForJob(ctx, jobId, itemIndex, waitForCompletion);
}

async function runTopologicIngest(
	ctx: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const script = ctx.getNodeParameter('ingestScript', itemIndex) as string;
	const inputFiles = toFileArray(
		ctx.getNodeParameter('ingestInputFiles', itemIndex, []),
		undefined,
	);
	const argsCollection = ctx.getNodeParameter('ingestArguments', itemIndex, {}) as {
		argumentValues?: Array<{ value: string }>;
	};
	const registerCde = ctx.getNodeParameter('ingestRegisterCde', itemIndex, false) as boolean;
	const outputFile = ctx.getNodeParameter('ingestOutputFile', itemIndex, '') as string;
	const waitForCompletion = ctx.getNodeParameter('ingestWaitForCompletion', itemIndex, true) as boolean;

	if (!inputFiles.length) {
		throw new NodeOperationError(ctx.getNode(), 'At least one input file is required', { itemIndex });
	}

	const args: string[] = [];
	if (argsCollection.argumentValues) {
		for (const arg of argsCollection.argumentValues) {
			if (arg.value !== undefined) {
				args.push(arg.value);
			}
		}
	}

	const body: IDataObject = {
		input_files: inputFiles,
		script,
		arguments: args,
	};
	if (outputFile) body.output_file = outputFile;

	applyVersionPins.call(ctx, body, itemIndex);

	let responseData = (await ifcPipelineApiRequest.call(
		ctx,
		'POST',
		'/topologicpy/ingest',
		body,
	)) as IDataObject;

	const jobId = (responseData.job_id as string | undefined)?.trim();
	if (waitForCompletion && jobId) {
		responseData = await waitForJob(
			ctx,
			jobId,
			itemIndex,
			waitForCompletion,
			INGEST_JOB_ORCHESTRATION_PARAMS,
		);
	}

	if (responseData.success === false || responseData.error) {
		throw new NodeOperationError(
			ctx.getNode(),
			truncateIngestError(responseData.error),
			{ itemIndex },
		);
	}

	const relationshipCount =
		(typeof responseData.relationship_count === 'number'
			? responseData.relationship_count
			: Array.isArray(responseData.relationships)
				? responseData.relationships.length
				: 0) ?? 0;

	if (registerCde) {
		const cdeBaseUrl = (ctx.getNodeParameter('ingestCdeBaseUrl', itemIndex, '') as string).trim();
		const cdeProjectId = (
			ctx.getNodeParameter('ingestCdeProjectId', itemIndex, '') as string
		).trim();
		const cdeRevisionRef = (
			ctx.getNodeParameter('ingestCdeRevisionRef', itemIndex, '') as string
		).trim();

		if (!cdeRevisionRef) {
			throw new NodeOperationError(
				ctx.getNode(),
				'CDE Revision Ref is required when Register in CDE is enabled',
				{ itemIndex },
			);
		}
		if (!cdeBaseUrl || !cdeProjectId) {
			throw new NodeOperationError(
				ctx.getNode(),
				'CDE Base URL and Project ID are required when Register in CDE is enabled',
				{ itemIndex },
			);
		}

		if (responseData.relationships) {
			const sourceLabel = `topologic_${script}`.slice(0, 32);
			const cdePayload: Record<string, unknown> = {
				projectId: cdeProjectId,
				source: sourceLabel,
				revisionRef: cdeRevisionRef,
				relationships: responseData.relationships,
			};

			try {
				const cdeResponse = (await ctx.helpers.requestWithAuthentication.call(
					ctx,
					'httpHeaderAuth',
					{
						method: 'POST',
						url: `${cdeBaseUrl.replace(/\/+$/, '')}/api/v2/graph/relationships`,
						body: cdePayload,
						headers: { 'Content-Type': 'application/json' },
						json: true,
					},
				)) as IDataObject;
				responseData.cde_registration = cdeResponse;

				const imported = (cdeResponse.imported as number | undefined) ?? 0;
				const skipped = (cdeResponse.skipped as number | undefined) ?? 0;
				if (relationshipCount > 0 && imported === 0 && skipped > 0) {
					throw new NodeOperationError(
						ctx.getNode(),
						`CDE registration skipped all ${relationshipCount} relationships (revision may not be projected yet)`,
						{ itemIndex },
					);
				}

				const summary =
					responseData.summary && typeof responseData.summary === 'object'
						? (responseData.summary as IDataObject)
						: undefined;
				responseData.ingest_outcome = {
					script,
					ifc_schema: summary?.ifc_schema,
					relationship_count: relationshipCount,
					element_count: responseData.element_count,
					cde: {
						imported,
						skipped,
						graphSynced: cdeResponse.graphSynced === true,
					},
				};
			} catch (cdeErr) {
				if (cdeErr instanceof NodeOperationError) {
					throw cdeErr;
				}
				const message = truncateIngestError((cdeErr as Error).message);
				responseData.cde_registration_error = message;
				throw new NodeOperationError(
					ctx.getNode(),
					`CDE graph registration failed: ${message}`,
					{ itemIndex },
				);
			}
		}
	}

	return sanitizeIngestResponse(responseData);
}
