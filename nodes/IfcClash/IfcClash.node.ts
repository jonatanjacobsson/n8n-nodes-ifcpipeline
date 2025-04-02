import { IExecuteFunctions } from 'n8n-workflow';
import { NodeConnectionType } from 'n8n-workflow';
import { INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { ifcPipelineApiRequest } from '../shared/GenericFunctions';

export class IfcClash implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'IFC Clash Detection',
		name: 'ifcClash',
		icon: 'file:ifcclash.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Detect spatial clashes between IFC models, for documentation see Ifcopenshell.',
		defaults: {
			name: 'IFC Clash Detection',
		},
		inputs: [{type: NodeConnectionType.Main}],
		outputs: [{type: NodeConnectionType.Main}],
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
						name: 'Detect Clashes',
						value: 'detectClashes',
						description: 'Detect clashes between IFC models',
						action: 'Detect clashes between IFC models',
					},
				],
				default: 'detectClashes',
			},

			// Detect Clashes - Clash Set A Files
			{
				displayName: 'Clash Set Name',
				name: 'clashSetName',
				type: 'string',
				default: 'Clash Set 1',
				required: true,
				displayOptions: {
					show: {
						operation: ['detectClashes'],
					},
				},
				description: 'The name of the clash set',
			},
			{
				displayName: 'Output Filename',
				name: 'outputFilename',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['detectClashes'],
					},
				},
				description: 'The name of the output file',
			},
			{
				displayName: 'Group A Files',
				name: 'groupAFiles',
				placeholder: 'Add Group A File',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				displayOptions: {
					show: {
						operation: ['detectClashes'],
					},
				},
				default: {},
				options: [
					{
						name: 'files',
						displayName: 'Files',
						values: [
							{
								displayName: 'File Path',
								name: 'file',
								type: 'string',
								default: '',
								description: 'Path to the IFC file',
							},
							{
								displayName: 'Selector',
								name: 'selector',
								type: 'string',
								default: '',
								description: 'Selector to filter elements in the file',
							},
							{
								displayName: 'Mode',
								name: 'mode',
								type: 'options',
								options: [
									{
										name: 'Exclude',
										value: 'e',
									},
									{
										name: 'Include',
										value: 'i',
									},
								],
								default: 'e',
								description: 'Whether to include or exclude the selected elements',
							},
						],
					},
				],
			},

			// Detect Clashes - Clash Set B Files
			{
				displayName: 'Group B Files',
				name: 'groupBFiles',
				placeholder: 'Add Group B File',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				displayOptions: {
					show: {
						operation: ['detectClashes'],
					},
				},
				default: {},
				options: [
					{
						name: 'files',
						displayName: 'Files',
						values: [
							{
								displayName: 'File Path',
								name: 'file',
								type: 'string',
								default: '',
								description: 'Path to the IFC file',
							},
							{
								displayName: 'Selector',
								name: 'selector',
								type: 'string',
								default: '',
								description: 'Selector to filter elements in the file',
							},
							{
								displayName: 'Mode',
								name: 'mode',
								type: 'options',
								options: [
									{
										name: 'Exclude',
										value: 'e',
									},
									{
										name: 'Include',
										value: 'i',
									},
								],
								default: 'e',
								description: 'Whether to include or exclude the selected elements',
							},
						],
					},
				],
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
						operation: ['detectClashes'],
					},
				},
				options: [
					{
						displayName: 'Tolerance',
						name: 'tolerance',
						type: 'number',
						default: 0.01,
						description: 'The tolerance for clash detection',
					},
					{
						displayName: 'Smart Grouping',
						name: 'smartGrouping',
						type: 'boolean',
						default: false,
						description: 'Whether to use smart grouping for clash detection',
					},
					{
						displayName: 'Max Cluster Distance',
						name: 'maxClusterDistance',
						type: 'number',
						default: 5.0,
						description: 'Maximum distance for clustering in smart grouping',
						displayOptions: {
							show: {
								smartGrouping: [true],
							},
						},
					},
					{
						displayName: 'Mode',
						name: 'mode',
						type: 'options',
						options: [
							{
								name: 'Intersection',
								value: 'intersection',
							},
							{
								name: 'Collision',
								value: 'collision',
							},
							{
								name: 'Clearance',
								value: 'clearance',
							},
						],
						default: 'intersection',
						description: 'The clash detection mode',
					},
					{
						displayName: 'Clearance',
						name: 'clearance',
						type: 'number',
						default: 0.0,
						description: 'The clearance value for clearance mode',
					},
					{
						displayName: 'Check All',
						name: 'checkAll',
						type: 'boolean',
						default: false,
						description: 'Whether to check all elements',
					},
					{
						displayName: 'Allow Touching',
						name: 'allowTouching',
						type: 'boolean',
						default: false,
						description: 'Whether to allow touching elements',
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
				if (operation === 'detectClashes') {
					// Detect Clashes
					const clashSetName = this.getNodeParameter('clashSetName', i) as string;
					const outputFilename = this.getNodeParameter('outputFilename', i) as string;
					const groupAFilesData = this.getNodeParameter('groupAFiles', i) as {
						files: Array<{
							file: string;
							selector?: string;
							mode?: string;
						}>;
					};
					const groupBFilesData = this.getNodeParameter('groupBFiles', i) as {
						files: Array<{
							file: string;
							selector?: string;
							mode?: string;
						}>;
					};
					const options = this.getNodeParameter('options', i) as {
						tolerance?: number;
						smartGrouping?: boolean;
						maxClusterDistance?: number;
						mode?: string;
						clearance?: number;
						checkAll?: boolean;
						allowTouching?: boolean;
					};

					// Prepare group A files
					const groupAFiles = (groupAFilesData.files || []).map(fileData => {
						const fileObj: { file: string; selector?: string; mode?: string } = {
							file: fileData.file,
						};
						if (fileData.selector) fileObj.selector = fileData.selector;
						if (fileData.mode) fileObj.mode = fileData.mode;
						return fileObj;
					});

					// Prepare group B files
					const groupBFiles = (groupBFilesData.files || []).map(fileData => {
						const fileObj: { file: string; selector?: string; mode?: string } = {
							file: fileData.file,
						};
						if (fileData.selector) fileObj.selector = fileData.selector;
						if (fileData.mode) fileObj.mode = fileData.mode;
						return fileObj;
					});

					const body: any = {
						clash_sets: [
							{
								name: clashSetName,
								a: groupAFiles,
								b: groupBFiles,
							},
						],
						output_filename: outputFilename,
					};

					// Add optional parameters
					if (options.tolerance !== undefined) body.tolerance = options.tolerance;
					if (options.smartGrouping !== undefined) body.smart_grouping = options.smartGrouping;
					if (options.maxClusterDistance !== undefined) body.max_cluster_distance = options.maxClusterDistance;
					if (options.mode !== undefined) body.mode = options.mode;
					if (options.clearance !== undefined) body.clearance = options.clearance;
					if (options.checkAll !== undefined) body.check_all = options.checkAll;
					if (options.allowTouching !== undefined) body.allow_touching = options.allowTouching;

					responseData = await ifcPipelineApiRequest.call(
						this,
						'POST',
						'/ifcclash',
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