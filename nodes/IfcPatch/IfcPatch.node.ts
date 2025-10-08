import { IExecuteFunctions, ILoadOptionsFunctions } from 'n8n-workflow';
import { NodeConnectionType } from 'n8n-workflow';
import { INodeExecutionData, INodeType, INodeTypeDescription, INodePropertyOptions } from 'n8n-workflow';
import { ifcPipelineApiRequest, pollForJobCompletion, getFiles } from '../shared/GenericFunctions';

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
				displayName: 'Input File Name or ID',
				name: 'inputFile',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getIfcFiles',
				},
				default: '',
				required: true,
				description: 'Select the input IFC file from available files. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				placeholder: 'Select an IFC file...',
			},
			{
				displayName: 'Output File',
				name: 'outputFile',
				type: 'string',
				default: '',
				required: true,
				description: 'The path or name of the output IFC file',
				placeholder: '/output/ifc/Building-Architecture_patched.ifc',
			},
		{
			displayName: 'Recipe Name or ID',
			name: 'recipeName',
			type: 'options',
			typeOptions: {
				loadOptionsMethod: 'getRecipes',
			},
			default: '',
			required: true,
			description: 'Select the IfcPatch recipe to execute. Recipes marked with [Custom] are user-defined scripts. The recipe description is shown in the dropdown. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			placeholder: 'Select a recipe...',
			hint: 'View recipe documentation at <a href="https://docs.ifcopenshell.org/autoapi/ifcpatch/recipes/index.html" target="_blank">IfcPatch Recipes</a>',
		},
			// Common recipe: ExtractElements parameters
			{
				displayName: 'Query',
				name: 'param_query',
				type: 'string',
				displayOptions: {
					show: {
						recipeName: ['ExtractElements'],
					},
				},
				default: 'IfcWall',
				description: 'A query to select the subset of IFC elements',
				placeholder: 'IfcWall',
				hint: 'Use IfcOpenShell <a href="https://docs.ifcopenshell.org/ifcopenshell-python/selector_syntax.html#filtering-elements" target="_blank">selector syntax</a> to filter elements (e.g., IfcWall, IfcBeam, .Pset_WallCommon.LoadBearing=TRUE)',
			},
			{
				displayName: 'Assume Asset Uniqueness By Name',
				name: 'param_assume_asset_uniqueness_by_name',
				type: 'boolean',
				displayOptions: {
					show: {
						recipeName: ['ExtractElements'],
					},
				},
				default: true,
				description: 'Whether to avoid adding assets (profiles, materials, styles) with the same name multiple times. Assumes different project assets use different names.',
			},
			// Common recipe: ConvertLengthUnit parameters
			{
				displayName: 'Target Unit',
				name: 'param_unit',
				type: 'options',
				displayOptions: {
					show: {
						recipeName: ['ConvertLengthUnit'],
					},
				},
				options: [
					{ name: 'Metre', value: 'METRE' },
					{ name: 'Millimetre', value: 'MILLIMETRE' },
					{ name: 'Foot', value: 'FOOT' },
					{ name: 'Inch', value: 'INCH' },
				],
				default: 'METRE',
				description: 'The target length unit for conversion',
			},
			// Fallback for other recipes - generic arguments
			{
				displayName: 'Arguments',
				name: 'argumentsUi',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				displayOptions: {
					hide: {
						recipeName: ['ExtractElements', 'ConvertLengthUnit', ''],
					},
				},
				default: {},
				description: 'Arguments to pass to the recipe. The number and type of arguments depend on the selected recipe. Add arguments in order.',
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
								description: 'Argument value',
								placeholder: 'Enter argument value',
							},
						],
					},
				],
			},
			// Notice for recipes without explicit parameter definitions
			{
				displayName: 'Using Generic Arguments',
				name: 'genericArgsNotice',
				type: 'notice',
				displayOptions: {
					show: {
						recipeName: [''],
					},
				},
				default: '⚠️ This recipe doesn\'t have explicit parameter definitions. Use the Arguments collection below and add values in the correct order. Refer to the IfcPatch documentation for parameter details.',
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
			// Get all available IFC files
			async getIfcFiles(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return await getFiles.call(this, ['.ifc']);
			},
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

					// Store recipes in context for use in parameter generation
					// Note: n8n doesn't have a built-in context store, so we'll fetch again in execute

					// Transform recipes into dropdown options with parameter count info
					const options: INodePropertyOptions[] = recipes.map((recipe: Recipe) => {
						const badge = recipe.is_custom ? ' [Custom]' : '';
						const paramCount = recipe.parameters?.length || 0;
						const paramInfo = paramCount > 0 ? ` (${paramCount} param${paramCount > 1 ? 's' : ''})` : '';
						return {
							name: `${recipe.name}${badge}${paramInfo}`,
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
							name: 'Error Loading Recipes',
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

				// Build arguments based on recipe type
				const args: any[] = [];

				// Check if recipe has explicit parameters defined
				if (recipeName === 'ExtractElements') {
					// ExtractElements parameters: query, assume_asset_uniqueness_by_name
					const query = this.getNodeParameter('param_query', i, 'IfcWall') as string;
					const assumeUniqueness = this.getNodeParameter('param_assume_asset_uniqueness_by_name', i, true) as boolean;
					args.push(query);
					args.push(assumeUniqueness);
				} else if (recipeName === 'ConvertLengthUnit') {
					// ConvertLengthUnit parameters: unit
					const unit = this.getNodeParameter('param_unit', i, 'METRE') as string;
					args.push(unit);
				} else {
					// Fallback: parse arguments from fixedCollection
					const argumentsUi = this.getNodeParameter('argumentsUi', i, {}) as {
						argumentValues?: Array<{ name?: string; value: string }>;
					};
					if (argumentsUi.argumentValues) {
						for (const arg of argumentsUi.argumentValues) {
							if (arg.value) {
								args.push(arg.value);
							}
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
