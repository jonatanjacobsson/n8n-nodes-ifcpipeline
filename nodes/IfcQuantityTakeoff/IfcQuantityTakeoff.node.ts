import { IExecuteFunctions } from 'n8n-workflow';
import { NodeConnectionType } from 'n8n-workflow';
import { INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { ifcPipelineApiRequest, pollForJobCompletion } from '../shared/GenericFunctions';

export class IfcQuantityTakeoff implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'IFC Quantity Takeoff',
		name: 'ifcQuantityTakeoff',
		icon: 'file:ifcopenshell.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Calculate quantities from IFC models',
		defaults: {
			name: 'IFC Quantity Takeoff',
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
						name: 'Calculate Quantities',
						value: 'calculateQuantities',
						description: 'Calculate quantities from IFC model',
						action: 'Calculate quantities from IFC model',
					},
				],
				default: 'calculateQuantities',
			},

			// Calculate Quantities
			{
				displayName: 'Input File',
				name: 'inputFile',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['calculateQuantities'],
					},
				},
				description: 'The name of the input IFC file',
			},
			{
				displayName: 'Output File',
				name: 'outputFile',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['calculateQuantities'],
					},
				},
				description: 'The name of the output IFC file. If left empty, the calculation results will be returned without modifying the original file.',
			},
			{
				displayName: 'Wait for Completion',
				name: 'waitForCompletion',
				type: 'boolean',
				default: true,
				displayOptions: {
					show: {
						operation: ['calculateQuantities'],
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
						operation: ['calculateQuantities'],
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
						operation: ['calculateQuantities'],
						waitForCompletion: [true],
					},
				},
				description: 'Maximum time to wait for job completion (in seconds)',
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
				if (operation === 'calculateQuantities') {
					// Calculate Quantities
					const inputFile = this.getNodeParameter('inputFile', i) as string;
					const outputFile = this.getNodeParameter('outputFile', i) as string;
					const waitForCompletion = this.getNodeParameter('waitForCompletion', i, true) as boolean;
					const pollingInterval = this.getNodeParameter('pollingInterval', i, 2) as number;
					const timeout = this.getNodeParameter('timeout', i, 300) as number;

					const body: any = {
						input_file: inputFile,
					};

					// Add output file if provided
					if (outputFile) {
						body.output_file = outputFile;
					}

					// Submit the job
					responseData = await ifcPipelineApiRequest.call(
						this,
						'POST',
						'/calculate-qtos',
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
