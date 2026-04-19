import { IExecuteFunctions, ILoadOptionsFunctions } from 'n8n-workflow';
import { NodeConnectionType } from 'n8n-workflow';
import { INodeExecutionData, INodeType, INodeTypeDescription, INodePropertyOptions } from 'n8n-workflow';
import { ifcPipelineApiRequest, pollForJobCompletion, getFiles } from '../shared/GenericFunctions';

export class Ifc2Peppol implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'IFC to Peppol',
		name: 'ifc2Peppol',
		icon: 'file:ifc2peppol.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Convert IFC files to Peppol BIS Catalogue XML format. Generates Peppol Catalogue XML from IFC models with BIP property sets. Note: This node requires credentials pointing to the ifc2peppol API service (separate from ifcpipeline).',
		defaults: {
			name: 'IFC to Peppol',
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
						name: 'Convert to Peppol',
						value: 'convertToPeppol',
						description: 'Convert IFC file to Peppol Catalogue XML format',
						action: 'Convert ifc file to peppol catalogue xml format',
					},
				],
				default: 'convertToPeppol',
			},

			// Convert to Peppol
			{
				displayName: 'IFC Filename Name or ID',
				name: 'filename',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getIfcFiles',
				},
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['convertToPeppol'],
					},
				},
				description: 'Select the IFC file to convert. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
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
						operation: ['convertToPeppol'],
					},
				},
				description: 'The name of the output Peppol Catalogue XML file',
				placeholder: 'output/peppol/catalogue.xml',
			},
			{
				displayName: 'Wait for Completion',
				name: 'waitForCompletion',
				type: 'boolean',
				default: true,
				displayOptions: {
					show: {
						operation: ['convertToPeppol'],
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
						operation: ['convertToPeppol'],
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
						operation: ['convertToPeppol'],
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
				if (operation === 'convertToPeppol') {
					// Convert to Peppol
					const filename = this.getNodeParameter('filename', i) as string;
					const outputFilename = this.getNodeParameter('outputFilename', i) as string;
					const waitForCompletion = this.getNodeParameter('waitForCompletion', i, true) as boolean;
					const pollingInterval = this.getNodeParameter('pollingInterval', i, 2) as number;
					const timeout = this.getNodeParameter('timeout', i, 300) as number;

					const body = {
						input_file: filename,
						output_file: outputFilename,
					};

					// Submit the job
					responseData = await ifcPipelineApiRequest.call(
						this,
						'POST',
						'/ifc2peppol',
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

