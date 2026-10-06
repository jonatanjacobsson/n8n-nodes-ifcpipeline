import type { IDataObject, IExecuteFunctions, ILoadOptionsFunctions } from 'n8n-workflow';
import { NodeConnectionType } from 'n8n-workflow';
import type { INodeExecutionData, INodeType, INodeTypeDescription, INodePropertyOptions } from 'n8n-workflow';
import {
	applyVersionPins,
	ifcPipelineApiRequest,
	getFiles,
	versionPinningProperty,
} from '../shared/GenericFunctions';
import {
	executeItemsWithJobOrchestration,
	jobOrchestrationProperties,
	waitForJob,
} from '../shared/jobOrchestrationProperties';

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
				placeholder: 'output/patch/Building-Architecture_patched.ifc',
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
								displayName: 'Parameter Name or ID',
								name: 'parameter',
								type: 'options',
								typeOptions: {
									loadOptionsMethod: 'getRecipeParameters',
									loadOptionsDependsOn: ['recipeName'],
								},
								default: '',
								description:
									'Which recipe parameter this value is for. Informational only: values are passed to the recipe in the order the arguments are listed. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
							},
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
			versionPinningProperty,
			...jobOrchestrationProperties,
		],
	};

	methods = {
		loadOptions: {
			// Get all available IFC files
			async getIfcFiles(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return await getFiles.call(this, ['.ifc']);
			},
			// Parameters of the selected recipe (name + docstring description), for the Arguments rows
			async getRecipeParameters(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const recipeName = this.getCurrentNodeParameter('recipeName') as string;
				if (!recipeName) {
					return [];
				}
				try {
					const responseData = await ifcPipelineApiRequest.call(
						this,
						'POST',
						'/patch/recipes/list',
						{ include_builtin: true, include_custom: true },
					);
					const recipe = (responseData.recipes as Recipe[] | undefined)?.find(
						(r) => r.name === recipeName,
					);
					const clip = (str: string, n: number) =>
						str.length > n ? str.slice(0, n - 1).trimEnd() + '\u2026' : str;
					const escape = (str: string) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;');
					return (recipe?.parameters ?? []).map((param) => {
						let full = (param.description || '').replace(/``/g, '').replace(/\s+/g, ' ').trim();
						const codeAt = full.search(/\.\. code::|Example:\s*\.\./);
						if (codeAt >= 0) {
							full = full.slice(0, codeAt).trim();
						}
						const exampleAt = full.search(/Example:\s*\{/);
						const lead = (exampleAt > 0 ? full.slice(0, exampleAt) : full).trim();
						const example = exampleAt > 0 ? full.slice(exampleAt).trim() : '';
						const firstSentence = (lead.match(/^.*?[.!?](?=\s|$)/) || [lead])[0]
							.replace(/[.:]$/, '')
							.trim();
						// Option text is clamped to two lines by n8n: short label in the name, detail below.
						const shortLabel = firstSentence.length > 0 && firstSentence.length <= 60;
						const extra = [param.required ? 'required' : 'optional', param.type]
							.filter(Boolean)
							.join(', ');
						const detail =
							example || (shortLabel && lead.length <= firstSentence.length + 1 ? '' : clip(lead, 180));
						return {
							name: shortLabel ? `${param.name} \u2014 ${firstSentence}` : param.name,
							value: param.name,
							description: escape(clip(detail || `(${extra})`, 200)),
						};
					});
				} catch {
					return [
						{
							name: 'Error Loading Parameters',
							value: '',
							description:
								'Failed to load recipe parameters. Please check your API credentials and connection.',
						},
					];
				}
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

						// Build description with parameter list
						let description = recipe.description || `Execute the ${recipe.name} recipe`;

						// Append parameter information if available (using HTML for better formatting)
						if (recipe.parameters && recipe.parameters.length > 0) {
							description += '<br><br><b>Parameters:</b>';
							recipe.parameters.forEach((param: RecipeParameter) => {
								const required = param.required ? ' <i>(required)</i>' : '';
								const defaultValue = param.default !== undefined ? ` <code>[default: ${param.default}]</code>` : '';
								const paramType = param.type ? ` <code>{${param.type}}</code>` : '';
								description += `<br>• <b>${param.name}</b>${paramType}${required}${defaultValue}`;
								if (param.description) {
									description += `<br>&nbsp;&nbsp;${param.description}`;
								}
							});
						}

						return {
							name: `${recipe.name}${badge}${paramInfo}`,
							value: recipe.name,
							description: description,
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
		return executeItemsWithJobOrchestration(this, items, async (itemIndex) =>
			runIfcPatch(this, itemIndex),
		);
	}
}

async function runIfcPatch(ctx: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const inputFile = ctx.getNodeParameter('inputFile', itemIndex) as string;
	const outputFile = ctx.getNodeParameter('outputFile', itemIndex) as string;
	const recipeName = ctx.getNodeParameter('recipeName', itemIndex) as string;
	const waitForCompletion = ctx.getNodeParameter('waitForCompletion', itemIndex, true) as boolean;

	const args: unknown[] = [];
	if (recipeName === 'ExtractElements') {
		args.push(ctx.getNodeParameter('param_query', itemIndex, 'IfcWall') as string);
	} else if (recipeName === 'ConvertLengthUnit') {
		args.push(ctx.getNodeParameter('param_unit', itemIndex, 'METRE') as string);
	} else {
		const argumentsUi = ctx.getNodeParameter('argumentsUi', itemIndex, {}) as {
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

	let isCustom = false;
	try {
		const recipesData = await ifcPipelineApiRequest.call(ctx, 'POST', '/patch/recipes/list', {
			include_builtin: true,
			include_custom: true,
		});
		const recipe = (recipesData.recipes as Recipe[] | undefined)?.find((r) => r.name === recipeName);
		if (recipe) {
			isCustom = recipe.is_custom;
		}
	} catch {
		// Allow execute when recipe list is unavailable.
	}

	const body: IDataObject = {
		input_file: inputFile,
		output_file: outputFile,
		recipe: recipeName,
		use_custom: isCustom,
		arguments: args,
	};
	applyVersionPins.call(ctx, body, itemIndex);

	const response = (await ifcPipelineApiRequest.call(ctx, 'POST', '/patch/execute', body)) as IDataObject;
	const jobId = (response.job_id as string | undefined)?.trim();
	if (!waitForCompletion || !jobId) {
		return response;
	}

	return waitForJob(ctx, jobId, itemIndex, waitForCompletion);
}
