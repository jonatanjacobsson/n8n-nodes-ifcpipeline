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
		description: 'Convert IFC files to different formats using IfcConvert. Full documentation at <a href="https://docs.ifcopenshell.org/ifcconvert/usage.html" target="_blank">IfcOpenShell</a>.',
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

			// Convert IFC - Basic Parameters
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
				description: 'The name of the output object key (e.g. output/converted/Building.glb, output/converted/Floor-01.svg). Bare filenames default to output/converted/ in the bucket.',
				placeholder: 'output/converted/Building-Architecture.glb',
			},

			// Command Line Options
			{
				displayName: 'Command Line Options',
				name: 'commandLineOptions',
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
						displayName: 'Verbose',
						name: 'verbose',
						type: 'boolean',
						default: true,
						description: 'Whether to output verbose information during conversion',
					},
					{
						displayName: 'Quiet',
						name: 'quiet',
						type: 'boolean',
						default: false,
						description: 'Whether to suppress output messages',
					},
					{
						displayName: 'Cache',
						name: 'cache',
						type: 'boolean',
						default: false,
						description: 'Whether to use cache for conversion',
					},
					{
						displayName: 'Cache File',
						name: 'cacheFile',
						type: 'string',
						default: '',
						description: 'Path to cache file (used with cache option)',
					},
					{
						displayName: 'Stderr Progress',
						name: 'stderrProgress',
						type: 'boolean',
						default: false,
						description: 'Whether to output progress to stderr',
					},
					{
						displayName: 'Yes (Skip Confirmations)',
						name: 'yes',
						type: 'boolean',
						default: false,
						description: 'Whether to skip all confirmation prompts',
					},
					{
						displayName: 'No Progress',
						name: 'noProgress',
						type: 'boolean',
						default: false,
						description: 'Whether to disable progress output',
					},
					{
						displayName: 'Log Format',
						name: 'logFormat',
						type: 'options',
						options: [
							{ name: 'Plain', value: 'plain' },
							{ name: 'JSON', value: 'json' },
						],
						default: 'plain',
						description: 'Format for log output',
					},
					{
						displayName: 'Log File',
						name: 'logFile',
						type: 'string',
						default: '',
						description: 'Custom path for the log file (auto-generated if not specified)',
					},
				],
			},

			// Geometry Options - General
			{
				displayName: 'Geometry Options - General',
				name: 'geometryGeneral',
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
						displayName: 'Kernel',
						name: 'kernel',
						type: 'options',
						options: [
							{ name: 'OpenCascade', value: 'opencascade' },
							{ name: 'CGAL', value: 'cgal' },
						],
						default: 'opencascade',
						description: 'Which geometry kernel to use',
					},
					{
						displayName: 'Threads',
						name: 'threads',
						type: 'number',
						default: 0,
						description: 'Number of threads to use (0 = auto)',
					},
					{
						displayName: 'Center Model',
						name: 'centerModel',
						type: 'boolean',
						default: false,
						description: 'Whether to center the model',
					},
					{
						displayName: 'Center Model Geometry',
						name: 'centerModelGeometry',
						type: 'boolean',
						default: false,
						description: 'Whether to center the model geometry',
					},
				],
			},

			// Geometry Options - Filtering
			{
				displayName: 'Geometry Options - Filtering',
				name: 'geometryFiltering',
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
						displayName: 'Include',
						name: 'include',
						type: 'string',
						default: '',
						description: 'Comma-separated list of elements to include in the conversion',
						hint: 'Use IfcOpenShell <a href="https://docs.ifcopenshell.org/ifcopenshell-python/selector_syntax.html#filtering-elements" target="_blank">selector syntax</a> for each item (e.g., IfcWall, IfcBeam, .Pset_WallCommon.LoadBearing=TRUE)',
					},
					{
						displayName: 'Include Type',
						name: 'includeType',
						type: 'options',
						options: [
							{ name: 'Entities', value: 'entities' },
							{ name: 'Layers', value: 'layers' },
							{ name: 'Attribute', value: 'attribute' },
						],
						default: 'entities',
						description: 'Type of filter for include option',
					},
					{
						displayName: 'Include Plus',
						name: 'includePlus',
						type: 'string',
						default: '',
						description: 'Comma-separated list with subtree inclusion',
					},
					{
						displayName: 'Include Plus Type',
						name: 'includePlusType',
						type: 'options',
						options: [
							{ name: 'Entities', value: 'entities' },
							{ name: 'Layers', value: 'layers' },
							{ name: 'Attribute', value: 'attribute' },
						],
						default: 'entities',
						description: 'Type of filter for include+ option',
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
						displayName: 'Exclude Type',
						name: 'excludeType',
						type: 'options',
						options: [
							{ name: 'Entities', value: 'entities' },
							{ name: 'Layers', value: 'layers' },
							{ name: 'Attribute', value: 'attribute' },
						],
						default: 'entities',
						description: 'Type of filter for exclude option',
					},
					{
						displayName: 'Exclude Plus',
						name: 'excludePlus',
						type: 'string',
						default: '',
						description: 'Comma-separated list with subtree exclusion',
					},
					{
						displayName: 'Exclude Plus Type',
						name: 'excludePlusType',
						type: 'options',
						options: [
							{ name: 'Entities', value: 'entities' },
							{ name: 'Layers', value: 'layers' },
							{ name: 'Attribute', value: 'attribute' },
						],
						default: 'entities',
						description: 'Type of filter for exclude+ option',
					},
					{
						displayName: 'Filter File',
						name: 'filterFile',
						type: 'string',
						default: '',
						description: 'Path to a file containing filter rules',
					},
				],
			},

			// Geometry Options - Materials and Rendering
			{
				displayName: 'Geometry Options - Materials & Rendering',
				name: 'geometryMaterials',
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
						displayName: 'Default Material File',
						name: 'defaultMaterialFile',
						type: 'string',
						default: '',
						description: 'Path to default material file',
					},
					{
						displayName: 'Exterior Only',
						name: 'exteriorOnly',
						type: 'options',
						options: [
							{ name: 'None', value: '' },
							{ name: 'True', value: 'true' },
							{ name: 'False', value: 'false' },
						],
						default: '',
						description: 'Whether to process only exterior elements',
					},
					{
						displayName: 'Apply Default Materials',
						name: 'applyDefaultMaterials',
						type: 'boolean',
						default: false,
						description: 'Whether to apply default materials',
					},
					{
						displayName: 'Use Material Names',
						name: 'useMaterialNames',
						type: 'boolean',
						default: false,
						description: 'Whether to use material names',
					},
					{
						displayName: 'Surface Colour',
						name: 'surfaceColour',
						type: 'boolean',
						default: false,
						description: 'Whether to use surface colour',
					},
				],
			},

			// Geometry Options - Representation Types
			{
				displayName: 'Geometry Options - Representation Types',
				name: 'geometryRepresentation',
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
						displayName: 'Plan',
						name: 'plan',
						type: 'boolean',
						default: false,
						description: 'Whether to include plan (2D) representation',
					},
					{
						displayName: 'Model',
						name: 'model',
						type: 'boolean',
						default: true,
						description: 'Whether to include model (3D) representation',
					},
					{
						displayName: 'Dimensionality',
						name: 'dimensionality',
						type: 'number',
						default: -1,
						description: 'Force dimensionality (e.g., 2 or 3, -1 for auto)',
					},
				],
			},

			// Geometry Options - Mesher Settings
			{
				displayName: 'Geometry Options - Mesher Settings',
				name: 'geometryMesher',
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
						displayName: 'Mesher Linear Deflection',
						name: 'mesherLinearDeflection',
						type: 'number',
						default: -1,
						description: 'Linear deflection for mesh generation (-1 for default)',
					},
					{
						displayName: 'Mesher Angular Deflection',
						name: 'mesherAngularDeflection',
						type: 'number',
						default: -1,
						description: 'Angular deflection for mesh generation (-1 for default)',
					},
					{
						displayName: 'Reorient Shells',
						name: 'reorientShells',
						type: 'boolean',
						default: false,
						description: 'Whether to reorient shells',
					},
				],
			},

			// Geometry Options - Units and Precision
			{
				displayName: 'Geometry Options - Units & Precision',
				name: 'geometryUnits',
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
						displayName: 'Length Unit',
						name: 'lengthUnit',
						type: 'number',
						default: -1,
						description: 'Length unit to use (-1 for default)',
					},
					{
						displayName: 'Angle Unit',
						name: 'angleUnit',
						type: 'number',
						default: -1,
						description: 'Angle unit to use (-1 for default)',
					},
					{
						displayName: 'Precision',
						name: 'precision',
						type: 'number',
						default: -1,
						description: 'Precision for geometry (-1 for default)',
					},
					{
						displayName: 'Precision Factor',
						name: 'precisionFactor',
						type: 'number',
						default: -1,
						description: 'Precision factor (-1 for default)',
					},
					{
						displayName: 'Convert Back Units',
						name: 'convertBackUnits',
						type: 'boolean',
						default: false,
						description: 'Whether to convert back units during conversion',
					},
				],
			},

			// Geometry Options - Layer and Material Processing
			{
				displayName: 'Geometry Options - Layer Processing',
				name: 'geometryLayers',
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
						displayName: 'Layerset First',
						name: 'layersetFirst',
						type: 'boolean',
						default: false,
						description: 'Whether to prioritize layerset',
					},
					{
						displayName: 'Enable Layerset Slicing',
						name: 'enableLayersetSlicing',
						type: 'boolean',
						default: false,
						description: 'Whether to enable slicing of products according to their associated IfcMaterialLayerSet',
					},
				],
			},

			// Geometry Options - Boolean Operations
			{
				displayName: 'Geometry Options - Boolean Operations',
				name: 'geometryBoolean',
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
						displayName: 'Disable Boolean Result',
						name: 'disableBooleanResult',
						type: 'boolean',
						default: false,
						description: 'Whether to disable boolean result processing',
					},
					{
						displayName: 'Disable Opening Subtractions',
						name: 'disableOpeningSubtractions',
						type: 'boolean',
						default: false,
						description: 'Whether to disable the boolean subtraction of IfcOpeningElement Representations',
					},
					{
						displayName: 'Merge Boolean Operands',
						name: 'mergeBooleanOperands',
						type: 'boolean',
						default: false,
						description: 'Whether to merge boolean operands during conversion',
					},
					{
						displayName: 'Boolean Attempt 2D',
						name: 'booleanAttempt2d',
						type: 'boolean',
						default: false,
						description: 'Whether to attempt 2D boolean operations',
					},
					{
						displayName: 'Debug',
						name: 'debug',
						type: 'boolean',
						default: false,
						description: 'Whether to enable debug mode',
					},
				],
			},

			// Geometry Options - Wire and Edge Processing
			{
				displayName: 'Geometry Options - Wire & Edge Processing',
				name: 'geometryWire',
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
						displayName: 'No Wire Intersection Check',
						name: 'noWireIntersectionCheck',
						type: 'boolean',
						default: false,
						description: 'Whether to skip wire intersection checks',
					},
					{
						displayName: 'No Wire Intersection Tolerance',
						name: 'noWireIntersectionTolerance',
						type: 'number',
						default: -1,
						description: 'Tolerance for wire intersection (-1 for default)',
					},
					{
						displayName: 'Edge Arrows',
						name: 'edgeArrows',
						type: 'boolean',
						default: false,
						description: 'Whether to add arrow heads to edge segments to signify edge direction',
					},
				],
			},

			// Geometry Options - Vertex and Shape Processing
			{
				displayName: 'Geometry Options - Vertex & Shape Processing',
				name: 'geometryVertex',
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
						displayName: 'Weld Vertices',
						name: 'weldVertices',
						type: 'boolean',
						default: false,
							description: 'Whether to weld vertices during conversion',
						},
					{
						displayName: 'Unify Shapes',
						name: 'unifyShapes',
						type: 'boolean',
						default: false,
						description: 'Whether to unify shapes',
					},
				],
			},

			// Geometry Options - Coordinate Systems
			{
				displayName: 'Geometry Options - Coordinate Systems',
				name: 'geometryCoords',
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
						displayName: 'Use World Coords',
						name: 'useWorldCoords',
						type: 'boolean',
						default: false,
						description: 'Whether to use world coordinates during conversion',
					},
					{
						displayName: 'Building Local Placement',
						name: 'buildingLocalPlacement',
						type: 'boolean',
						default: false,
						description: 'Whether to place elements locally in the parent IfcBuilding coord system',
					},
					{
						displayName: 'Site Local Placement',
						name: 'siteLocalPlacement',
						type: 'boolean',
						default: false,
						description: 'Whether to place elements locally in the IfcSite coordinate system',
					},
					{
						displayName: 'Model Offset',
						name: 'modelOffset',
						type: 'string',
						default: '',
						description: 'Applies an arbitrary offset of form \'x,y,z\' to all placements',
						placeholder: '0,0,0',
					},
					{
						displayName: 'Model Rotation',
						name: 'modelRotation',
						type: 'string',
						default: '',
						description: 'Applies an arbitrary quaternion rotation of form \'x,y,z,w\' to all placements',
						placeholder: '0,0,0,1',
					},
				],
			},

			// Geometry Options - Context and Output
			{
				displayName: 'Geometry Options - Context & Output',
				name: 'geometryContext',
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
						displayName: 'Context IDs',
						name: 'contextIds',
						type: 'string',
						default: '',
						description: 'Comma-separated list of context IDs',
					},
					{
						displayName: 'Iterator Output',
						name: 'iteratorOutput',
						type: 'number',
						default: -1,
						description: 'Iterator output mode (-1 for default)',
					},
				],
			},

			// Geometry Options - Normals and UVs
			{
				displayName: 'Geometry Options - Normals & UVs',
				name: 'geometryNormals',
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
						displayName: 'No Normals',
						name: 'noNormals',
						type: 'boolean',
						default: false,
						description: 'Whether to disable computation of normals (saves time and file size)',
					},
					{
						displayName: 'Generate UVs',
						name: 'generateUvs',
						type: 'boolean',
						default: false,
						description: 'Whether to generate UVs (texture coordinates) using simple box projection',
					},
				],
			},

			// Geometry Options - Validation and Hierarchy
			{
				displayName: 'Geometry Options - Validation & Hierarchy',
				name: 'geometryValidation',
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
						displayName: 'Validate',
						name: 'validate',
						type: 'boolean',
						default: false,
						description: 'Whether to check geometrical output conforms to the included explicit quantities',
					},
					{
						displayName: 'Element Hierarchy',
						name: 'elementHierarchy',
						type: 'boolean',
						default: false,
						description: 'Whether to assign elements using their e.g IfcBuildingStorey parent (applicable to DAE output)',
					},
				],
			},

			// Geometry Options - Spaces and Bounding Boxes
			{
				displayName: 'Geometry Options - Spaces & Bounding Boxes',
				name: 'geometrySpaces',
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
						displayName: 'Force Space Transparency',
						name: 'forceSpaceTransparency',
						type: 'number',
						default: -1,
						description: 'Overrides transparency of spaces in geometry output (-1 for default)',
					},
					{
						displayName: 'Keep Bounding Boxes',
						name: 'keepBoundingBoxes',
						type: 'boolean',
						default: false,
						description: 'Whether to keep IfcBoundingBox in model (default is to remove)',
					},
				],
			},

			// Geometry Options - CGAL Specific
			{
				displayName: 'Geometry Options - CGAL Specific',
				name: 'geometryCgal',
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
						displayName: 'Circle Segments',
						name: 'circleSegments',
						type: 'number',
						default: -1,
						description: 'Number of segments to approximate full circles in CGAL kernel (-1 for default: 16)',
					},
				],
			},

			// Geometry Options - Function Curves
			{
				displayName: 'Geometry Options - Function Curves',
				name: 'geometryFunctions',
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
						displayName: 'Function Step Type',
						name: 'functionStepType',
						type: 'number',
						default: -1,
						description: 'Method used for defining step size when evaluating function-based curves (-1 for default)',
					},
					{
						displayName: 'Function Step Param',
						name: 'functionStepParam',
						type: 'number',
						default: -1,
						description: 'Parameter value for defining step size when evaluating function-based curves (-1 for default)',
					},
				],
			},

			// Geometry Options - Performance
			{
				displayName: 'Geometry Options - Performance',
				name: 'geometryPerformance',
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
						displayName: 'No Parallel Mapping',
						name: 'noParallelMapping',
						type: 'boolean',
						default: false,
						description: 'Whether to perform mapping upfront (single-threaded) as opposed to in parallel',
					},
					{
						displayName: 'Sew Shells',
						name: 'sewShells',
						type: 'boolean',
						default: false,
						description: 'Whether to sew shells during conversion',
					},
				],
			},

			// Geometry Options - Triangulation
			{
				displayName: 'Geometry Options - Triangulation',
				name: 'geometryTriangulation',
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
						displayName: 'Triangulation Type',
						name: 'triangulationType',
						type: 'number',
						default: -1,
						description: 'Type of planar facet to be emitted (-1 for default)',
					},
				],
			},

			// Serialization Options - SVG Specific
			{
				displayName: 'Serialization Options - SVG Specific',
				name: 'serializationSvg',
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
						description: 'Bounding rectangle (e.g., 512x512) to which the output will be scaled (SVG only)',
						placeholder: '512x512',
					},
					{
						displayName: 'Scale',
						name: 'scale',
						type: 'string',
						default: '',
						description: 'Interprets SVG bounds in mm, centers layout and draws elements to scale (e.g., 1:100)',
						placeholder: '1:100',
					},
					{
						displayName: 'Center',
						name: 'center',
						type: 'string',
						default: '',
						description: 'Location in range [0 1]x[0 1] around which to center drawings (default: 0.5x0.5)',
						placeholder: '0.5x0.5',
					},
					{
						displayName: 'Section Ref',
						name: 'sectionRef',
						type: 'string',
						default: '',
						description: 'Element at which cross sections should be created',
					},
					{
						displayName: 'Elevation Ref',
						name: 'elevationRef',
						type: 'string',
						default: '',
						description: 'Element at which drawings should be created',
					},
					{
						displayName: 'Elevation Ref GUID',
						name: 'elevationRefGuid',
						type: 'string',
						default: '',
						description: 'Comma-separated element GUIDs at which drawings should be created',
					},
					{
						displayName: 'Auto Section',
						name: 'autoSection',
						type: 'boolean',
						default: false,
						description: 'Whether to create SVG cross section drawings automatically based on model extents',
					},
					{
						displayName: 'Auto Elevation',
						name: 'autoElevation',
						type: 'boolean',
						default: false,
						description: 'Whether to create SVG elevation drawings automatically based on model extents',
					},
					{
						displayName: 'Draw Storey Heights',
						name: 'drawStoreyHeights',
						type: 'options',
						options: [
							{ name: 'None', value: '' },
							{ name: 'Full', value: 'full' },
							{ name: 'Left', value: 'left' },
						],
						default: '',
						description: 'Whether to draw horizontal line at building storey heights in vertical drawings',
					},
					{
						displayName: 'Storey Height Line Length',
						name: 'storeyHeightLineLength',
						type: 'number',
						default: -1,
						description: 'Length of the line when draw-storey-heights=left (-1 for default)',
					},
					{
						displayName: 'SVG XMLNS',
						name: 'svgXmlns',
						type: 'boolean',
						default: false,
						description: 'Whether to store name and guid in a separate namespace (instead of data-name, data-guid)',
					},
					{
						displayName: 'SVG Poly',
						name: 'svgPoly',
						type: 'boolean',
						default: false,
						description: 'Whether to use the polygonal algorithm for hidden line rendering',
					},
					{
						displayName: 'SVG Prefilter',
						name: 'svgPrefilter',
						type: 'boolean',
						default: false,
						description: 'Whether to prefilter faces and shapes before feeding to HLR algorithm',
					},
					{
						displayName: 'SVG Segment Projection',
						name: 'svgSegmentProjection',
						type: 'boolean',
						default: false,
						description: 'Whether to segment result of projection wrt original products',
					},
					{
						displayName: 'SVG Write Poly',
						name: 'svgWritePoly',
						type: 'boolean',
						default: false,
						description: 'Whether to approximate every curve as polygonal in SVG output',
					},
					{
						displayName: 'SVG Project',
						name: 'svgProject',
						type: 'boolean',
						default: false,
						description: 'Whether to always enable hidden line rendering instead of only on elevations',
					},
					{
						displayName: 'SVG Without Storeys',
						name: 'svgWithoutStoreys',
						type: 'boolean',
						default: false,
						description: 'Whether to skip emitting drawings for building storeys',
					},
					{
						displayName: 'SVG No CSS',
						name: 'svgNoCss',
						type: 'boolean',
						default: false,
						description: 'Whether to skip emitting CSS style declarations',
					},
					{
						displayName: 'Door Arcs',
						name: 'doorArcs',
						type: 'boolean',
						default: false,
						description: 'Whether to draw door opening arcs for IfcDoor elements',
					},
					{
						displayName: 'Section Height',
						name: 'sectionHeight',
						type: 'number',
						default: -1,
						description: 'Cut section height for SVG 2D geometry (-1 for default)',
					},
					{
						displayName: 'Section Height From Storeys',
						name: 'sectionHeightFromStoreys',
						type: 'boolean',
						default: false,
						description: 'Whether to derive section height from storey elevation',
					},
					{
						displayName: 'Print Space Names',
						name: 'printSpaceNames',
						type: 'boolean',
						default: false,
						description: 'Whether to print IfcSpace LongName and Name in SVG output',
					},
					{
						displayName: 'Print Space Areas',
						name: 'printSpaceAreas',
						type: 'boolean',
						default: false,
						description: 'Whether to print calculated IfcSpace areas in square meters (SVG output)',
					},
					{
						displayName: 'Space Name Transform',
						name: 'spaceNameTransform',
						type: 'string',
						default: '',
						description: 'Additional transform to the space labels in SVG',
					},
				],
			},

			// Serialization Options - Naming Conventions
			{
				displayName: 'Serialization Options - Naming Conventions',
				name: 'serializationNaming',
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
						displayName: 'Use Element Names',
						name: 'useElementNames',
						type: 'boolean',
						default: false,
						description: 'Whether to use IfcRoot.Name instead of unique IDs for naming (OBJ, DAE, STP, SVG)',
					},
					{
						displayName: 'Use Element GUIDs',
						name: 'useElementGuids',
						type: 'boolean',
						default: false,
						description: 'Whether to use IfcRoot.GlobalId instead of unique IDs for naming (OBJ, DAE, STP, SVG)',
					},
					{
						displayName: 'Use Element Step IDs',
						name: 'useElementStepIds',
						type: 'boolean',
						default: false,
						description: 'Whether to use numeric step identifier for naming (OBJ, DAE, STP, SVG)',
					},
					{
						displayName: 'Use Element Types',
						name: 'useElementTypes',
						type: 'boolean',
						default: false,
						description: 'Whether to use element types instead of unique IDs for naming (DAE output)',
					},
				],
			},

			// Serialization Options - Coordinate System and Format
			{
				displayName: 'Serialization Options - Coordinate System & Format',
				name: 'serializationFormat',
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
						displayName: 'Y Up',
						name: 'yUp',
						type: 'boolean',
						default: false,
						description: 'Whether to change the \'up\' axis to positive Y (default is Z UP) - applicable to OBJ output',
					},
					{
						displayName: 'ECEF',
						name: 'ecef',
						type: 'boolean',
						default: false,
						description: 'Whether to write glTF in Earth-Centered Earth-Fixed coordinates (requires PROJ)',
					},
				],
			},

			// Serialization Options - Precision
			{
				displayName: 'Serialization Options - Precision',
				name: 'serializationPrecision',
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
						displayName: 'Digits',
						name: 'digits',
						type: 'number',
						default: -1,
						description: 'Precision for floating-point values (15 by default, -1 for system default) - OBJ, DAE output',
					},
				],
			},

			// Serialization Options - RDF/WKT
			{
				displayName: 'Serialization Options - RDF/WKT',
				name: 'serializationRdf',
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
						displayName: 'Base URI',
						name: 'baseUri',
						type: 'string',
						default: '',
						description: 'Base URI for products to be used in RDF-based serializations',
					},
					{
						displayName: 'WKT Use Section',
						name: 'wktUseSection',
						type: 'boolean',
						default: false,
						description: 'Whether to use geometrical section rather than full polyhedral output in TTL WKT',
					},
				],
			},

			// Wait for Completion Options
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

					// Get all option collections
					const commandLineOptions = this.getNodeParameter('commandLineOptions', i, {}) as any;
					const geometryGeneral = this.getNodeParameter('geometryGeneral', i, {}) as any;
					const geometryFiltering = this.getNodeParameter('geometryFiltering', i, {}) as any;
					const geometryMaterials = this.getNodeParameter('geometryMaterials', i, {}) as any;
					const geometryRepresentation = this.getNodeParameter('geometryRepresentation', i, {}) as any;
					const geometryMesher = this.getNodeParameter('geometryMesher', i, {}) as any;
					const geometryUnits = this.getNodeParameter('geometryUnits', i, {}) as any;
					const geometryLayers = this.getNodeParameter('geometryLayers', i, {}) as any;
					const geometryBoolean = this.getNodeParameter('geometryBoolean', i, {}) as any;
					const geometryWire = this.getNodeParameter('geometryWire', i, {}) as any;
					const geometryVertex = this.getNodeParameter('geometryVertex', i, {}) as any;
					const geometryCoords = this.getNodeParameter('geometryCoords', i, {}) as any;
					const geometryContext = this.getNodeParameter('geometryContext', i, {}) as any;
					const geometryNormals = this.getNodeParameter('geometryNormals', i, {}) as any;
					const geometryValidation = this.getNodeParameter('geometryValidation', i, {}) as any;
					const geometrySpaces = this.getNodeParameter('geometrySpaces', i, {}) as any;
					const geometryCgal = this.getNodeParameter('geometryCgal', i, {}) as any;
					const geometryFunctions = this.getNodeParameter('geometryFunctions', i, {}) as any;
					const geometryPerformance = this.getNodeParameter('geometryPerformance', i, {}) as any;
					const geometryTriangulation = this.getNodeParameter('geometryTriangulation', i, {}) as any;
					const serializationSvg = this.getNodeParameter('serializationSvg', i, {}) as any;
					const serializationNaming = this.getNodeParameter('serializationNaming', i, {}) as any;
					const serializationFormat = this.getNodeParameter('serializationFormat', i, {}) as any;
					const serializationPrecision = this.getNodeParameter('serializationPrecision', i, {}) as any;
					const serializationRdf = this.getNodeParameter('serializationRdf', i, {}) as any;

					const waitForCompletion = this.getNodeParameter('waitForCompletion', i, true) as boolean;
					const pollingInterval = this.getNodeParameter('pollingInterval', i, 2) as number;
					const timeout = this.getNodeParameter('timeout', i, 300) as number;

					const body: any = {
						input_filename: inputFilename,
						output_filename: outputFilename,
					};

					// Command Line Options
					if (commandLineOptions.verbose !== undefined) body.verbose = commandLineOptions.verbose;
					if (commandLineOptions.quiet !== undefined) body.quiet = commandLineOptions.quiet;
					if (commandLineOptions.cache !== undefined) body.cache = commandLineOptions.cache;
					if (commandLineOptions.cacheFile) body.cache_file = commandLineOptions.cacheFile;
					if (commandLineOptions.stderrProgress !== undefined) body.stderr_progress = commandLineOptions.stderrProgress;
					if (commandLineOptions.yes !== undefined) body.yes = commandLineOptions.yes;
					if (commandLineOptions.noProgress !== undefined) body.no_progress = commandLineOptions.noProgress;
					if (commandLineOptions.logFormat) body.log_format = commandLineOptions.logFormat;
					if (commandLineOptions.logFile) body.log_file = commandLineOptions.logFile;

					// Geometry General
					if (geometryGeneral.kernel) body.kernel = geometryGeneral.kernel;
					if (geometryGeneral.threads !== undefined && geometryGeneral.threads > 0) body.threads = geometryGeneral.threads;
					if (geometryGeneral.centerModel !== undefined) body.center_model = geometryGeneral.centerModel;
					if (geometryGeneral.centerModelGeometry !== undefined) body.center_model_geometry = geometryGeneral.centerModelGeometry;

					// Geometry Filtering
					if (geometryFiltering.include) {
						body.include = geometryFiltering.include.split(',').map((item: string) => item.trim());
						if (geometryFiltering.includeType) body.include_type = geometryFiltering.includeType;
					}
					if (geometryFiltering.includePlus) {
						body.include_plus = geometryFiltering.includePlus.split(',').map((item: string) => item.trim());
						if (geometryFiltering.includePlusType) body.include_plus_type = geometryFiltering.includePlusType;
					}
					if (geometryFiltering.exclude) {
						body.exclude = geometryFiltering.exclude.split(',').map((item: string) => item.trim());
						if (geometryFiltering.excludeType) body.exclude_type = geometryFiltering.excludeType;
					}
					if (geometryFiltering.excludePlus) {
						body.exclude_plus = geometryFiltering.excludePlus.split(',').map((item: string) => item.trim());
						if (geometryFiltering.excludePlusType) body.exclude_plus_type = geometryFiltering.excludePlusType;
					}
					if (geometryFiltering.filterFile) body.filter_file = geometryFiltering.filterFile;

					// Geometry Materials
					if (geometryMaterials.defaultMaterialFile) body.default_material_file = geometryMaterials.defaultMaterialFile;
					if (geometryMaterials.exteriorOnly) body.exterior_only = geometryMaterials.exteriorOnly;
					if (geometryMaterials.applyDefaultMaterials !== undefined) body.apply_default_materials = geometryMaterials.applyDefaultMaterials;
					if (geometryMaterials.useMaterialNames !== undefined) body.use_material_names = geometryMaterials.useMaterialNames;
					if (geometryMaterials.surfaceColour !== undefined) body.surface_colour = geometryMaterials.surfaceColour;

					// Geometry Representation
					if (geometryRepresentation.plan !== undefined) body.plan = geometryRepresentation.plan;
					if (geometryRepresentation.model !== undefined) body.model = geometryRepresentation.model;
					if (geometryRepresentation.dimensionality !== undefined && geometryRepresentation.dimensionality >= 0) {
						body.dimensionality = geometryRepresentation.dimensionality;
					}

					// Geometry Mesher
					if (geometryMesher.mesherLinearDeflection !== undefined && geometryMesher.mesherLinearDeflection >= 0) {
						body.mesher_linear_deflection = geometryMesher.mesherLinearDeflection;
					}
					if (geometryMesher.mesherAngularDeflection !== undefined && geometryMesher.mesherAngularDeflection >= 0) {
						body.mesher_angular_deflection = geometryMesher.mesherAngularDeflection;
					}
					if (geometryMesher.reorientShells !== undefined) body.reorient_shells = geometryMesher.reorientShells;

					// Geometry Units
					if (geometryUnits.lengthUnit !== undefined && geometryUnits.lengthUnit >= 0) {
						body.length_unit = geometryUnits.lengthUnit;
					}
					if (geometryUnits.angleUnit !== undefined && geometryUnits.angleUnit >= 0) {
						body.angle_unit = geometryUnits.angleUnit;
					}
					if (geometryUnits.precision !== undefined && geometryUnits.precision >= 0) {
						body.precision = geometryUnits.precision;
					}
					if (geometryUnits.precisionFactor !== undefined && geometryUnits.precisionFactor >= 0) {
						body.precision_factor = geometryUnits.precisionFactor;
					}
					if (geometryUnits.convertBackUnits !== undefined) body.convert_back_units = geometryUnits.convertBackUnits;

					// Geometry Layers
					if (geometryLayers.layersetFirst !== undefined) body.layerset_first = geometryLayers.layersetFirst;
					if (geometryLayers.enableLayersetSlicing !== undefined) body.enable_layerset_slicing = geometryLayers.enableLayersetSlicing;

					// Geometry Boolean
					if (geometryBoolean.disableBooleanResult !== undefined) body.disable_boolean_result = geometryBoolean.disableBooleanResult;
					if (geometryBoolean.disableOpeningSubtractions !== undefined) body.disable_opening_subtractions = geometryBoolean.disableOpeningSubtractions;
					if (geometryBoolean.mergeBooleanOperands !== undefined) body.merge_boolean_operands = geometryBoolean.mergeBooleanOperands;
					if (geometryBoolean.booleanAttempt2d !== undefined) body.boolean_attempt_2d = geometryBoolean.booleanAttempt2d;
					if (geometryBoolean.debug !== undefined) body.debug = geometryBoolean.debug;

					// Geometry Wire
					if (geometryWire.noWireIntersectionCheck !== undefined) body.no_wire_intersection_check = geometryWire.noWireIntersectionCheck;
					if (geometryWire.noWireIntersectionTolerance !== undefined && geometryWire.noWireIntersectionTolerance >= 0) {
						body.no_wire_intersection_tolerance = geometryWire.noWireIntersectionTolerance;
					}
					if (geometryWire.edgeArrows !== undefined) body.edge_arrows = geometryWire.edgeArrows;

					// Geometry Vertex
					if (geometryVertex.weldVertices !== undefined) body.weld_vertices = geometryVertex.weldVertices;
					if (geometryVertex.unifyShapes !== undefined) body.unify_shapes = geometryVertex.unifyShapes;

					// Geometry Coords
					if (geometryCoords.useWorldCoords !== undefined) body.use_world_coords = geometryCoords.useWorldCoords;
					if (geometryCoords.buildingLocalPlacement !== undefined) body.building_local_placement = geometryCoords.buildingLocalPlacement;
					if (geometryCoords.siteLocalPlacement !== undefined) body.site_local_placement = geometryCoords.siteLocalPlacement;
					if (geometryCoords.modelOffset) body.model_offset = geometryCoords.modelOffset;
					if (geometryCoords.modelRotation) body.model_rotation = geometryCoords.modelRotation;

					// Geometry Context
					if (geometryContext.contextIds) {
						body.context_ids = geometryContext.contextIds.split(',').map((item: string) => item.trim());
					}
					if (geometryContext.iteratorOutput !== undefined && geometryContext.iteratorOutput >= 0) {
						body.iterator_output = geometryContext.iteratorOutput;
					}

					// Geometry Normals
					if (geometryNormals.noNormals !== undefined) body.no_normals = geometryNormals.noNormals;
					if (geometryNormals.generateUvs !== undefined) body.generate_uvs = geometryNormals.generateUvs;

					// Geometry Validation
					if (geometryValidation.validate !== undefined) body.validate = geometryValidation.validate;
					if (geometryValidation.elementHierarchy !== undefined) body.element_hierarchy = geometryValidation.elementHierarchy;

					// Geometry Spaces
					if (geometrySpaces.forceSpaceTransparency !== undefined && geometrySpaces.forceSpaceTransparency >= 0) {
						body.force_space_transparency = geometrySpaces.forceSpaceTransparency;
					}
					if (geometrySpaces.keepBoundingBoxes !== undefined) body.keep_bounding_boxes = geometrySpaces.keepBoundingBoxes;

					// Geometry CGAL
					if (geometryCgal.circleSegments !== undefined && geometryCgal.circleSegments >= 0) {
						body.circle_segments = geometryCgal.circleSegments;
					}

					// Geometry Functions
					if (geometryFunctions.functionStepType !== undefined && geometryFunctions.functionStepType >= 0) {
						body.function_step_type = geometryFunctions.functionStepType;
					}
					if (geometryFunctions.functionStepParam !== undefined && geometryFunctions.functionStepParam >= 0) {
						body.function_step_param = geometryFunctions.functionStepParam;
					}

					// Geometry Performance
					if (geometryPerformance.noParallelMapping !== undefined) body.no_parallel_mapping = geometryPerformance.noParallelMapping;
					if (geometryPerformance.sewShells !== undefined) body.sew_shells = geometryPerformance.sewShells;

					// Geometry Triangulation
					if (geometryTriangulation.triangulationType !== undefined && geometryTriangulation.triangulationType >= 0) {
						body.triangulation_type = geometryTriangulation.triangulationType;
					}

					// Serialization SVG
					if (serializationSvg.bounds) body.bounds = serializationSvg.bounds;
					if (serializationSvg.scale) body.scale = serializationSvg.scale;
					if (serializationSvg.center) body.center = serializationSvg.center;
					if (serializationSvg.sectionRef) body.section_ref = serializationSvg.sectionRef;
					if (serializationSvg.elevationRef) body.elevation_ref = serializationSvg.elevationRef;
					if (serializationSvg.elevationRefGuid) {
						body.elevation_ref_guid = serializationSvg.elevationRefGuid.split(',').map((item: string) => item.trim());
					}
					if (serializationSvg.autoSection !== undefined) body.auto_section = serializationSvg.autoSection;
					if (serializationSvg.autoElevation !== undefined) body.auto_elevation = serializationSvg.autoElevation;
					if (serializationSvg.drawStoreyHeights) body.draw_storey_heights = serializationSvg.drawStoreyHeights;
					if (serializationSvg.storeyHeightLineLength !== undefined && serializationSvg.storeyHeightLineLength >= 0) {
						body.storey_height_line_length = serializationSvg.storeyHeightLineLength;
					}
					if (serializationSvg.svgXmlns !== undefined) body.svg_xmlns = serializationSvg.svgXmlns;
					if (serializationSvg.svgPoly !== undefined) body.svg_poly = serializationSvg.svgPoly;
					if (serializationSvg.svgPrefilter !== undefined) body.svg_prefilter = serializationSvg.svgPrefilter;
					if (serializationSvg.svgSegmentProjection !== undefined) body.svg_segment_projection = serializationSvg.svgSegmentProjection;
					if (serializationSvg.svgWritePoly !== undefined) body.svg_write_poly = serializationSvg.svgWritePoly;
					if (serializationSvg.svgProject !== undefined) body.svg_project = serializationSvg.svgProject;
					if (serializationSvg.svgWithoutStoreys !== undefined) body.svg_without_storeys = serializationSvg.svgWithoutStoreys;
					if (serializationSvg.svgNoCss !== undefined) body.svg_no_css = serializationSvg.svgNoCss;
					if (serializationSvg.doorArcs !== undefined) body.door_arcs = serializationSvg.doorArcs;
					if (serializationSvg.sectionHeight !== undefined && serializationSvg.sectionHeight >= 0) {
						body.section_height = serializationSvg.sectionHeight;
					}
					if (serializationSvg.sectionHeightFromStoreys !== undefined) body.section_height_from_storeys = serializationSvg.sectionHeightFromStoreys;
					if (serializationSvg.printSpaceNames !== undefined) body.print_space_names = serializationSvg.printSpaceNames;
					if (serializationSvg.printSpaceAreas !== undefined) body.print_space_areas = serializationSvg.printSpaceAreas;
					if (serializationSvg.spaceNameTransform) body.space_name_transform = serializationSvg.spaceNameTransform;

					// Serialization Naming
					if (serializationNaming.useElementNames !== undefined) body.use_element_names = serializationNaming.useElementNames;
					if (serializationNaming.useElementGuids !== undefined) body.use_element_guids = serializationNaming.useElementGuids;
					if (serializationNaming.useElementStepIds !== undefined) body.use_element_step_ids = serializationNaming.useElementStepIds;
					if (serializationNaming.useElementTypes !== undefined) body.use_element_types = serializationNaming.useElementTypes;

					// Serialization Format
					if (serializationFormat.yUp !== undefined) body.y_up = serializationFormat.yUp;
					if (serializationFormat.ecef !== undefined) body.ecef = serializationFormat.ecef;

					// Serialization Precision
					if (serializationPrecision.digits !== undefined && serializationPrecision.digits >= -1) {
						body.digits = serializationPrecision.digits;
					}

					// Serialization RDF
					if (serializationRdf.baseUri) body.base_uri = serializationRdf.baseUri;
					if (serializationRdf.wktUseSection !== undefined) body.wkt_use_section = serializationRdf.wktUseSection;

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
