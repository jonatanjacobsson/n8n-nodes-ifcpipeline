import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

/**
 * IFC Pipeline API credential.
 *
 * Starting with 0.7.0 these nodes target the object-storage (S3/MinIO)
 * variant of ifcpipeline exclusively. The target deployment must have
 * `USE_OBJECT_STORAGE=true` — there is no filesystem fallback.
 */
export class IfcPipelineApi implements ICredentialType {
	name = 'ifcPipelineApi';
	displayName = 'IFC Pipeline API';
	documentationUrl = 'https://github.com/jonatanjacobsson/ifcpipeline';
	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'http://api-gateway',
			placeholder: 'http://api-gateway',
			description: 'The base URL of your IFC Pipeline API gateway. The target deployment must run with USE_OBJECT_STORAGE=true.',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			description: 'The API key for the IFC Pipeline API',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'X-API-Key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/health',
			method: 'GET',
		},
	};
}
