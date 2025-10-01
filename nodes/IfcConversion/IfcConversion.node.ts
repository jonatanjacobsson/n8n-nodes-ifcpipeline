import { IExecuteFunctions, ILoadOptionsFunctions } from 'n8n-workflow';
import { NodeConnectionType } from 'n8n-workflow';
import { INodeExecutionData, INodeType, INodeTypeDescription, INodePropertyOptions } from 'n8n-workflow';
import { ifcPipelineApiRequest, pollForJobCompletion, getFiles } from '../shared/GenericFunctions';

export class IfcConversion implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'IFC Conversion',
		name: 'ifcConversion',
		icon: 'file:ifcconversion.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Convert IFC files to different formats, for documentation see Ifcopenshell.',
		defaults: {
			name: 'IFC Conversion',
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
						name: 'Convert IFC',
						value: 'convertIfc',
						description: 'Convert IFC file to another format',
						action: 'Convert IFC file to another format',
					},
				],
				default: 'convertIfc',
			},

			// Convert IFC
			{
				displayName: 'Input Filename Name or ID',
				name: 'inputFilename',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getIfcFiles',
				},
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['convertIfc'],
					},
				},
				description: 'Select the input IFC file from available files. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				placeholder: 'Select an IFC file...',
			},
			{
				displayName: 'Output Filename',
				name: 'outputFilename',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['convertIfc'],
					},
				},
				description: 'The name of the output file',
				placeholder: '/output/glb/Building-Architecture.glb',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: {
					show: {
						operation: ['convertIfc'],
					},
				},
				options: [
					{
						displayName: 'Bounds',
						name: 'bounds',
						type: 'string',
						default: '',
						description: 'The bounds to use for the conversion',
					},
					{
						displayName: 'Convert Back Units',
						name: 'convertBackUnits',
						type: 'boolean',
						default: false,
						description: 'Whether to convert back units during conversion',
					},
					{
						displayName: 'Disable Opening Subtractions',
						name: 'disableOpeningSubtractions',
						type: 'boolean',
						default: false,
						description: 'Whether to disable opening subtractions during conversion',
					},
					{
						displayName: 'Exclude',
						name: 'exclude',
						type: 'string',
						default: '',
						description: 'Comma-separated list of elements to exclude from the conversion',
						hint: 'Use IfcOpenShell <a href="https://docs.ifcopenshell.org/ifcopenshell-python/selector_syntax.html#filtering-elements" target="_blank">selector syntax</a> for each item (e.g., IfcWall, IfcBeam, .Pset_WallCommon.LoadBearing=TRUE)',
					},
					{
						displayName: 'Include',
						name: 'include',
						type: 'string',
						default: '',
						description: 'Comma-separated list of elements to include in the conversion',
						hint: 'Use IfcOpenShell <a href="https://docs.ifcopenshell.org/ifcopenshell-python/selector_syntax.html#filtering-elements" target="_blank">selector syntax</a> for each item (e.g., IfcWall, IfcBeam, .Pset_WallCommon.LoadBearing=TRUE)',
					},
					{
						displayName: 'Log File',
						name: 'logFile',
						type: 'string',
						default: '',
						description: 'The log file to use for the conversion',
					},
					{
						displayName: 'Merge Boolean Operands',
						name: 'mergeBooleanOperands',
						type: 'boolean',
						default: false,
						description: 'Whether to merge boolean operands during conversion',
					},
					{
						displayName: 'Model',
						name: 'model',
						type: 'boolean',
						default: true,
						description: 'Whether to include model information in the conversion',
					},
					{
						displayName: 'Plan',
						name: 'plan',
						type: 'boolean',
						default: false,
						description: 'Whether to include plan information in the conversion',
					},
					{
						displayName: 'Sew Shells',
						name: 'sewShells',
						type: 'boolean',
						default: false,
						description: 'Whether to sew shells during conversion',
					},
					{
						displayName: 'Use World Coords',
						name: 'useWorldCoords',
						type: 'boolean',
						default: false,
						description: 'Whether to use world coordinates during conversion',
					},
					{
						displayName: 'Verbose',
						name: 'verbose',
						type: 'boolean',
						default: true,
						description: 'Whether to output verbose information during conversion',
					},
					{
						displayName: 'Weld Vertices',
						name: 'weldVertices',
						type: 'boolean',
						default: false,
							description: 'Whether to weld vertices during conversion',
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
							operation: ['convertIfc'],
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
							operation: ['convertIfc'],
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
							operation: ['convertIfc'],
							waitForCompletion: [true],
						},
					},
					description: 'Maximum time to wait for job completion (in seconds)',
				},
			],
		};

	methods = {
		loadOptions: {
			// Get all available IFC files
			async getIfcFiles(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return await getFiles.call(this, ['.ifc']);
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		let responseData;
		const returnData: INodeExecutionData[] = [];

		const operation = this.getNodeParameter('operation', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				if (operation === 'convertIfc') {
					// Convert IFC
					const inputFilename = this.getNodeParameter('inputFilename', i) as string;
					const outputFilename = this.getNodeParameter('outputFilename', i) as string;
					const options = this.getNodeParameter('options', i) as {
						verbose?: boolean;
						plan?: boolean;
						model?: boolean;
						weldVertices?: boolean;
						useWorldCoords?: boolean;
						convertBackUnits?: boolean;
						sewShells?: boolean;
						mergeBooleanOperands?: boolean;
						disableOpeningSubtractions?: boolean;
						bounds?: string;
						include?: string;
						exclude?: string;
						logFile?: string;
					};
					const waitForCompletion = this.getNodeParameter('waitForCompletion', i, true) as boolean;
					const pollingInterval = this.getNodeParameter('pollingInterval', i, 2) as number;
					const timeout = this.getNodeParameter('timeout', i, 300) as number;

					const body: any = {
						input_filename: inputFilename,
						output_filename: outputFilename,
					};

					// Add optional parameters
					if (options.verbose !== undefined) body.verbose = options.verbose;
					if (options.plan !== undefined) body.plan = options.plan;
					if (options.model !== undefined) body.model = options.model;
					if (options.weldVertices !== undefined) body.weld_vertices = options.weldVertices;
					if (options.useWorldCoords !== undefined) body.use_world_coords = options.useWorldCoords;
					if (options.convertBackUnits !== undefined) body.convert_back_units = options.convertBackUnits;
					if (options.sewShells !== undefined) body.sew_shells = options.sewShells;
					if (options.mergeBooleanOperands !== undefined) body.merge_boolean_operands = options.mergeBooleanOperands;
					if (options.disableOpeningSubtractions !== undefined) body.disable_opening_subtractions = options.disableOpeningSubtractions;
					if (options.bounds) body.bounds = options.bounds;

					// Convert comma-separated strings to arrays
					if (options.include) body.include = options.include.split(',').map(item => item.trim());
					if (options.exclude) body.exclude = options.exclude.split(',').map(item => item.trim());

					if (options.logFile) body.log_file = options.logFile;

					// Submit the job
					responseData = await ifcPipelineApiRequest.call(
						this,
						'POST',
						'/ifcconvert',
						body,
					);

					const jobId = responseData.job_id;

					// If waitForCompletion is true, poll for job status
					if (waitForCompletion && jobId) {
						responseData = await pollForJobCompletion(this, jobId, pollingInterval, timeout);
					}

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
