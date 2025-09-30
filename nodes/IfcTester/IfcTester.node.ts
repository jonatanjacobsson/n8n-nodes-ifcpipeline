import { IExecuteFunctions } from 'n8n-workflow';
import { NodeConnectionType } from 'n8n-workflow';
import { INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { ifcPipelineApiRequest, pollForJobCompletion } from '../shared/GenericFunctions';

export class IfcTester implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'IFC Tester',
		name: 'ifcTester',
		icon: 'file:ifctester.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Validate IFC files against IDS specifications, for documentation see Ifcopenshell.',
		defaults: {
			name: 'IFC Tester',
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
						name: 'Validate IFC',
						value: 'validateIfc',
						description: 'Validate IFC file against IDS specification',
						action: 'Validate IFC file against IDS specification',
					},
				],
				default: 'validateIfc',
			},

			// Validate IFC
			{
				displayName: 'IFC Filename',
				name: 'ifcFilename',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['validateIfc'],
					},
				},
				description: 'The name of the IFC file to validate',
			},
			{
				displayName: 'IDS Filename',
				name: 'idsFilename',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['validateIfc'],
					},
				},
				description: 'The name of the IDS specification file',
			},
			{
				displayName: 'Output Filename',
				name: 'outputFilename',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['validateIfc'],
					},
				},
				description: 'The name of the output report file',
			},
			{
				displayName: 'Report Type',
				name: 'reportType',
				type: 'options',
				options: [
					{
						name: 'JSON',
						value: 'json',
					},
					{
						name: 'HTML',
						value: 'html',
					},
					{
						name: 'Excel',
						value: 'xlsx',
					},
				],
				default: 'json',
				displayOptions: {
					show: {
						operation: ['validateIfc'],
					},
				},
				description: 'The type of the validation report',
			},
			{
				displayName: 'Wait for Completion',
				name: 'waitForCompletion',
				type: 'boolean',
				default: true,
				displayOptions: {
					show: {
						operation: ['validateIfc'],
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
						operation: ['validateIfc'],
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
						operation: ['validateIfc'],
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
				if (operation === 'validateIfc') {
					// Validate IFC
					const ifcFilename = this.getNodeParameter('ifcFilename', i) as string;
					const idsFilename = this.getNodeParameter('idsFilename', i) as string;
					const outputFilename = this.getNodeParameter('outputFilename', i) as string;
					const reportType = this.getNodeParameter('reportType', i) as string;
					const waitForCompletion = this.getNodeParameter('waitForCompletion', i, true) as boolean;
					const pollingInterval = this.getNodeParameter('pollingInterval', i, 2) as number;
					const timeout = this.getNodeParameter('timeout', i, 300) as number;

					const body = {
						ifc_filename: ifcFilename,
						ids_filename: idsFilename,
						output_filename: outputFilename,
						report_type: reportType,
					};

					// Submit the job
					responseData = await ifcPipelineApiRequest.call(
						this,
						'POST',
						'/ifctester',
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
