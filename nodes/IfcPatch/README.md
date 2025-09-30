# IFC Patch Node for n8n

## Overview

The IFC Patch node allows you to execute IfcPatch recipes on IFC files directly from n8n workflows. It supports both built-in recipes from IfcOpenShell and custom user-defined recipes.

## Features

- **Execute Recipes**: Run any IfcPatch recipe (built-in or custom)
- **List Recipes**: Get all available recipes with metadata
- **Job Polling**: Automatically wait for job completion
- **Dynamic Arguments**: Pass multiple arguments to recipes
- **Custom Recipes**: Execute your own custom recipes
- **Error Handling**: Built-in error handling with continue-on-fail support

## Operations

### 1. Execute Recipe

Execute an IfcPatch recipe on an IFC file.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| Input File | String | Yes | Name of the input IFC file (e.g., `model.ifc`) |
| Output File | String | Yes | Name of the output IFC file (e.g., `model_patched.ifc`) |
| Recipe Name | String | Yes | Name of the recipe to execute (e.g., `ExtractElements`, `CeilingGrids`) |
| Use Custom Recipe | Boolean | No | Toggle to use custom recipe instead of built-in (default: false) |
| Recipe Arguments | Collection | No | List of arguments to pass to the recipe |
| Wait for Completion | Boolean | No | Whether to wait for job completion (default: true) |
| Polling Interval | Number | No | Seconds between status checks (default: 2) |
| Timeout | Number | No | Maximum wait time in seconds (default: 300) |

#### Examples

**Extract Walls from IFC:**
```json
{
  "inputFile": "building.ifc",
  "outputFile": "walls_only.ifc",
  "recipeName": "ExtractElements",
  "useCustom": false,
  "arguments": [".IfcWall"]
}
```

**Analyze Ceiling Grids (Custom Recipe):**
```json
{
  "inputFile": "building.ifc",
  "outputFile": "analyzed.ifc",
  "recipeName": "CeilingGrids",
  "useCustom": true,
  "arguments": ["analyze"]
}
```

**Optimize IFC File:**
```json
{
  "inputFile": "large_model.ifc",
  "outputFile": "optimized.ifc",
  "recipeName": "Optimise",
  "useCustom": false,
  "arguments": []
}
```

#### Output

The node returns job information including:

```json
{
  "job_id": "abc123-def456",
  "status": "finished",
  "result": {
    "success": true,
    "message": "Successfully applied recipe 'ExtractElements'",
    "output_path": "/output/patch/walls_only.ifc",
    "recipe": "ExtractElements",
    "is_custom": false,
    "output_size_bytes": 1234567,
    "arguments_used": [".IfcWall"]
  }
}
```

### 2. List Available Recipes

Get a list of all available IfcPatch recipes.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| Include Built-in Recipes | Boolean | No | Include built-in IfcOpenShell recipes (default: true) |
| Include Custom Recipes | Boolean | No | Include custom user recipes (default: true) |

#### Example

```json
{
  "includeBuiltin": true,
  "includeCustom": true
}
```

#### Output

Returns a list of recipes with metadata:

```json
{
  "success": true,
  "recipes": [
    {
      "name": "ExtractElements",
      "description": "Extract specific elements from an IFC file",
      "is_custom": false,
      "parameters": [
        {
          "name": "query",
          "type": "str",
          "description": "Selector query for elements"
        }
      ],
      "output_type": "ifcopenshell.file"
    },
    {
      "name": "CeilingGrids",
      "description": "Process ceiling grid systems in IFC models",
      "is_custom": true,
      "parameters": [],
      "output_type": "ifcopenshell.file"
    }
  ],
  "total_count": 46,
  "builtin_count": 45,
  "custom_count": 1
}
```

## Usage in Workflows

### Basic Workflow

```
Manual Trigger
  ↓
Set Input Parameters
  ↓
IFC Patch (Execute Recipe)
  ↓
Process Result
```

### Advanced Workflow

```
Upload IFC File
  ↓
IFC Patch (List Recipes) ──→ Display Available Recipes
  ↓
IFC Patch (Execute Recipe)
  ↓
Check Job Status
  ↓
Download Result
  ↓
Send Notification
```

### Example: Extract Walls Workflow

1. **Upload IFC File** node
   - Upload `building.ifc` to IFC Pipeline

2. **IFC Patch** node
   - Operation: Execute Recipe
   - Input File: `building.ifc`
   - Output File: `walls.ifc`
   - Recipe Name: `ExtractElements`
   - Arguments: `.IfcWall`

3. **Download Result** node
   - Download the processed `walls.ifc` file

### Example: Custom Recipe Workflow

1. **Manual Trigger**

2. **IFC Patch** node
   - Operation: Execute Recipe
   - Input File: `model.ifc`
   - Output File: `analyzed.ifc`
   - Recipe Name: `CeilingGrids`
   - Use Custom Recipe: `true`
   - Arguments: 
     - `analyze`

3. **Process Results** node
   - Parse the analysis results

## Built-in Recipes

Some commonly used built-in recipes:

- **ExtractElements** - Extract specific IFC elements
- **ConvertLengthUnit** - Convert measurement units
- **MergeProjects** - Merge multiple IFC files
- **Optimise** - Optimize file size
- **Migrate** - Migrate between IFC schemas
- **ResetAbsoluteCoordinates** - Reset coordinate system
- **SplitByBuildingStorey** - Split by building levels

See [IfcPatch Documentation](https://docs.ifcopenshell.org/autoapi/ifcpatch/recipes/index.html) for the complete list.

## Custom Recipes

Custom recipes can be created in the IFC Pipeline worker. Once added to the `/ifcpatch-worker/custom_recipes/` directory, they become available to this node.

### Creating a Custom Recipe

1. Copy the template in `ifc-pipeline/ifcpatch-worker/custom_recipes/example_recipe.py`
2. Implement your custom logic
3. Deploy to the worker
4. Use in n8n with `Use Custom Recipe: true`

See the [Custom Recipes README](../../../ifc-pipeline/ifcpatch-worker/custom_recipes/README.md) for details.

## Job Polling

When "Wait for Completion" is enabled (default), the node automatically polls the IFC Pipeline API for job status:

- **Polling Interval**: How often to check (default: 2 seconds)
- **Timeout**: Maximum wait time (default: 300 seconds)
- **Status Tracking**: Monitors job progress (queued → started → finished)

If polling is disabled, the node returns immediately with the job ID, and you can check status using the "Check Job Status" operation in other nodes.

## Error Handling

The node provides comprehensive error handling:

- **Invalid Recipe**: Error if recipe doesn't exist
- **File Not Found**: Error if input file doesn't exist
- **Job Timeout**: Error if job exceeds timeout
- **Job Failed**: Error if recipe execution fails
- **Continue on Fail**: Option to continue workflow on errors

## Configuration

### Credentials

The node requires IFC Pipeline API credentials:

1. Add credentials: **IFC Pipeline API**
2. Configure:
   - **URL**: Your IFC Pipeline URL (e.g., `http://localhost:8000`)
   - **API Key**: Your API key

### Node Settings

- **Always Output Data**: Enable to get data even on errors
- **Continue On Fail**: Enable to continue workflow on errors
- **Retry On Fail**: Configure retry attempts

## Tips and Best Practices

1. **Use Descriptive Output Names**: Name your output files clearly (e.g., `building_walls_only.ifc`)

2. **Start with List Recipes**: Use the "List Recipes" operation first to discover available recipes

3. **Test Custom Recipes**: Test custom recipes in isolation before using in workflows

4. **Monitor Job Times**: Adjust timeout based on file size and recipe complexity

5. **Use Error Handling**: Enable "Continue on Fail" for robust workflows

6. **Chain Operations**: Combine multiple IfcPatch operations in sequence

7. **Log Results**: Capture job results for debugging and auditing

## Troubleshooting

### Recipe Not Found
- Verify recipe name spelling
- Check if recipe exists using "List Recipes" operation
- Ensure "Use Custom Recipe" toggle is correct

### Job Timeout
- Increase timeout value
- Check IFC Pipeline worker logs
- Verify file is not corrupted

### Authentication Failed
- Verify API credentials are correct
- Check API key has proper permissions
- Ensure IFC Pipeline URL is accessible

### File Not Found
- Ensure file was uploaded successfully
- Check file path in IFC Pipeline
- Verify file permissions

## API Integration

The node integrates with these IFC Pipeline endpoints:

- `POST /patch/execute` - Execute a recipe
- `POST /patch/recipes/list` - List available recipes
- `GET /jobs/{job_id}/status` - Check job status

## Version History

- **v1.0** (2025-01-01)
  - Initial release
  - Execute Recipe operation
  - List Available Recipes operation
  - Job polling support
  - Custom recipe support

## Support

For issues or questions:
- Check IFC Pipeline logs: `docker-compose logs ifcpatch-worker`
- Review [Implementation Guide](../../../ifc-pipeline/IFCPATCH_WORKER_IMPLEMENTATION_SUMMARY.md)
- Consult [IfcPatch Documentation](https://docs.ifcopenshell.org/ifcpatch.html)

## License

MIT License - See LICENSE.md for details
