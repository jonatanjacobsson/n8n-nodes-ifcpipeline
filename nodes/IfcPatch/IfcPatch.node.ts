import { IExecuteFunctions } from 'n8n-workflow';
import { NodeConnectionType } from 'n8n-workflow';
import { INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { ifcPipelineApiRequest, pollForJobCompletion } from '../shared/GenericFunctions';

export class IfcPatch implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'IFC Patch',
		name: 'ifcPatch',
		icon: 'file:ifcopenshell.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Apply IfcPatch recipes to modify IFC files using built-in or custom recipes',
		defaults: {
			name: 'IFC Patch',
		},
		inputs: ['main'] as NodeConnectionType[] as NodeConnectionType[],
		outputs: ['main'] as NodeConnectionType[] as NodeConnectionType[],
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
						name: 'Execute Recipe',
						value: 'executeRecipe',
						description: 'Execute an IfcPatch recipe (built-in or custom)',
						action: 'Execute an ifc patch recipe',
					},
					{
						name: 'List Available Recipes',
						value: 'listRecipes',
						description: 'List all available IfcPatch recipes',
						action: 'List all available recipes',
					},
				],
				default: 'executeRecipe',
			},

			// Execute Recipe Operation
			{
				displayName: 'Input File',
				name: 'inputFile',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['executeRecipe'],
					},
				},
				description: 'The name of the input IFC file',
				placeholder: '/uploads/model.ifc',
			},
			{
				displayName: 'Output File',
				name: 'outputFile',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['executeRecipe'],
					},
				},
				description: 'The name of the output IFC file',
				placeholder: '/output/model_patched.ifc',
			},
			{
				displayName: 'Recipe Name',
				name: 'recipeName',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['executeRecipe'],
					},
				},
				description: 'Name of the recipe to execute (e.g., ExtractElements, CeilingGrids)',
				placeholder: 'ExtractElements',
			},
			{
				displayName: 'Use Custom Recipe',
				name: 'useCustom',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						operation: ['executeRecipe'],
					},
				},
				description: 'Whether to use a custom recipe instead of a built-in one',
			},
			{
				displayName: 'Recipe Arguments',
				name: 'argumentsUi',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				displayOptions: {
					show: {
						operation: ['executeRecipe'],
					},
				},
				description: 'Arguments to pass to the recipe',
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
								description: 'Argument value',
								placeholder: '.IfcWall or analyze',
							},
						],
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
						operation: ['executeRecipe'],
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
						operation: ['executeRecipe'],
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
						operation: ['executeRecipe'],
						waitForCompletion: [true],
					},
				},
				description: 'Maximum time to wait for job completion (in seconds)',
			},

			// List Recipes Operation
			{
				displayName: 'Include Built-in Recipes',
				name: 'includeBuiltin',
				type: 'boolean',
				default: true,
				displayOptions: {
					show: {
						operation: ['listRecipes'],
					},
				},
				description: 'Whether to include built-in IfcPatch recipes in the list',
			},
			{
				displayName: 'Include Custom Recipes',
				name: 'includeCustom',
				type: 'boolean',
				default: true,
				displayOptions: {
					show: {
						operation: ['listRecipes'],
					},
				},
				description: 'Whether to include custom recipes in the list',
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
				if (operation === 'executeRecipe') {
					// Execute IfcPatch Recipe
					const inputFile = this.getNodeParameter('inputFile', i) as string;
					const outputFile = this.getNodeParameter('outputFile', i) as string;
					const recipeName = this.getNodeParameter('recipeName', i) as string;
					const useCustom = this.getNodeParameter('useCustom', i, false) as boolean;
					const waitForCompletion = this.getNodeParameter('waitForCompletion', i, true) as boolean;
					const pollingInterval = this.getNodeParameter('pollingInterval', i, 2) as number;
					const timeout = this.getNodeParameter('timeout', i, 300) as number;

					// Parse arguments from fixedCollection
					const argumentsUi = this.getNodeParameter('argumentsUi', i, {}) as {
						argumentValues?: Array<{ value: string }>;
					};
					const args: string[] = [];
					if (argumentsUi.argumentValues) {
						for (const arg of argumentsUi.argumentValues) {
							if (arg.value) {
								args.push(arg.value);
							}
						}
					}

					const body: any = {
						input_file: inputFile,
						output_file: outputFile,
						recipe: recipeName,
						use_custom: useCustom,
						arguments: args,
					};

					// Submit the job
					responseData = await ifcPipelineApiRequest.call(
						this,
						'POST',
						'/patch/execute',
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
				} else if (operation === 'listRecipes') {
					// List Available Recipes
					const includeBuiltin = this.getNodeParameter('includeBuiltin', i, true) as boolean;
					const includeCustom = this.getNodeParameter('includeCustom', i, true) as boolean;

					const body: any = {
						include_builtin: includeBuiltin,
						include_custom: includeCustom,
					};

					responseData = await ifcPipelineApiRequest.call(
						this,
						'POST',
						'/patch/recipes/list',
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
