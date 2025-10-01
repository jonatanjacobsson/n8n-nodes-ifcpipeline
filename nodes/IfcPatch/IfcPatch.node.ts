import { IExecuteFunctions, ILoadOptionsFunctions } from 'n8n-workflow';
import { NodeConnectionType } from 'n8n-workflow';
import { INodeExecutionData, INodeType, INodeTypeDescription, INodePropertyOptions } from 'n8n-workflow';
import { ifcPipelineApiRequest, pollForJobCompletion } from '../shared/GenericFunctions';

// Interface for recipe metadata from API
interface RecipeParameter {
	name: string;
	type: string;
	description: string;
	required?: boolean;
	default?: any;
}

interface Recipe {
	name: string;
	description: string;
	is_custom: boolean;
	parameters?: RecipeParameter[];
}

export class IfcPatch implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'IFC Patch',
		name: 'ifcPatch',
		icon: 'file:ifcopenshell.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["recipeName"]}}',
		description: 'Apply IfcPatch recipes to modify IFC files - dynamically loads built-in and custom recipes',
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
				displayName: 'Input File',
				name: 'inputFile',
				type: 'string',
				default: '',
				required: true,
				description: 'The path or name of the input IFC file',
				placeholder: '/uploads/model.ifc',
			},
			{
				displayName: 'Output File',
				name: 'outputFile',
				type: 'string',
				default: '',
				required: true,
				description: 'The path or name of the output IFC file',
				placeholder: '/output/model_patched.ifc',
			},
			{
				displayName: 'Recipe',
				name: 'recipeName',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getRecipes',
				},
				default: '',
				required: true,
				description: 'Select the IfcPatch recipe to execute. Recipes marked with [Custom] are user-defined scripts. The recipe description is shown in the dropdown.',
				placeholder: 'Select a recipe...',
			},
			{
				displayName: 'Recipe Information',
				name: 'recipeInfo',
				type: 'notice',
				default: 'ℹ️ Each recipe has specific arguments. Common recipes:<br/>• <strong>ExtractElements</strong>: Requires IFC query (e.g., ".IfcWall")<br/>• <strong>Optimise</strong>: No arguments needed<br/>• <strong>ResetAbsoluteCoordinates</strong>: No arguments needed<br/>• <strong>ConvertLengthUnit</strong>: Requires target unit (e.g., "METRE")<br/><br/>Hover over the Recipe dropdown to see each recipe\'s description.',
			},
			{
				displayName: 'Arguments',
				name: 'argumentsUi',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				description: 'Arguments to pass to the recipe. The number and type of arguments depend on the selected recipe. Check the recipe description for required arguments.',
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
								description: 'Argument value (e.g., ".IfcWall" for ExtractElements, "METRE" for ConvertLengthUnit)',
								placeholder: 'Enter argument value',
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
				description: 'Whether to wait for the job to complete before continuing',
			},
			{
				displayName: 'Polling Interval (Seconds)',
				name: 'pollingInterval',
				type: 'number',
				default: 2,
				displayOptions: {
					show: {
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
						waitForCompletion: [true],
					},
				},
				description: 'Maximum time to wait for job completion (in seconds)',
			},
		],
	};

	methods = {
		loadOptions: {
			// Get all available recipes (built-in and custom)
			async getRecipes(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				try {
					// Fetch recipes from the API
					const responseData = await ifcPipelineApiRequest.call(
						this,
						'POST',
						'/patch/recipes/list',
						{
							include_builtin: true,
							include_custom: true,
						},
					);

					const recipes = responseData.recipes as Recipe[];
					
					// Transform recipes into dropdown options
					const options: INodePropertyOptions[] = recipes.map((recipe: Recipe) => {
						const badge = recipe.is_custom ? ' [Custom]' : '';
						return {
							name: `${recipe.name}${badge}`,
							value: recipe.name,
							description: recipe.description || `Execute the ${recipe.name} recipe`,
						};
					});

					// Sort options: built-in first, then custom, alphabetically within each group
					options.sort((a, b) => {
						const aIsCustom = a.name.includes('[Custom]');
						const bIsCustom = b.name.includes('[Custom]');
						
						if (aIsCustom === bIsCustom) {
							return a.name.localeCompare(b.name);
						}
						return aIsCustom ? 1 : -1;
					});

					return options;
				} catch (error) {
					// Return empty array on error with a helpful message
					return [
						{
							name: 'Error loading recipes',
							value: '',
							description: 'Failed to load recipes. Please check your API credentials and connection.',
						},
					];
				}
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		let responseData;
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				// Get parameters
				const inputFile = this.getNodeParameter('inputFile', i) as string;
				const outputFile = this.getNodeParameter('outputFile', i) as string;
				const recipeName = this.getNodeParameter('recipeName', i) as string;
				const waitForCompletion = this.getNodeParameter('waitForCompletion', i, true) as boolean;
				const pollingInterval = this.getNodeParameter('pollingInterval', i, 2) as number;
				const timeout = this.getNodeParameter('timeout', i, 300) as number;

				// Parse arguments from fixedCollection
				const argumentsUi = this.getNodeParameter('argumentsUi', i, {}) as {
					argumentValues?: Array<{ name?: string; value: string }>;
				};
				const args: string[] = [];
				if (argumentsUi.argumentValues) {
					for (const arg of argumentsUi.argumentValues) {
						if (arg.value) {
							args.push(arg.value);
						}
					}
				}

				// Fetch recipe metadata to determine if it's custom
				let isCustom = false;
				try {
					const recipesData = await ifcPipelineApiRequest.call(
						this,
						'POST',
						'/patch/recipes/list',
						{
							include_builtin: true,
							include_custom: true,
						},
					);
					
					const recipe = recipesData.recipes?.find((r: Recipe) => r.name === recipeName);
					if (recipe) {
						isCustom = recipe.is_custom;
					}
				} catch (error) {
					// If we can't fetch recipe metadata, assume it's not custom
					// This allows the node to work even if the list endpoint is unavailable
				}

				const body: any = {
					input_file: inputFile,
					output_file: outputFile,
					recipe: recipeName,
					use_custom: isCustom,
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
