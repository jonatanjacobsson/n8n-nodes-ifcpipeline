# IFC Patch Node for n8n

## Overview

The IFC Patch node allows you to execute IfcPatch recipes on IFC files directly from n8n workflows. It features **dynamic recipe loading** that automatically populates all built-in and custom recipes in an easy-to-use dropdown.

## Key Features

- **🎯 Dynamic Recipe Loading**: Automatically fetches and displays all available recipes (built-in + custom)
- **📝 Recipe Descriptions**: Each recipe shows its description in the dropdown for easy selection
- **🏷️ Smart Labeling**: Custom recipes are clearly marked with a `[Custom]` badge
- **✨ Simplified Interface**: One unified node for all recipes - no more manual configuration
- **🔄 Auto-Detection**: Automatically determines if a recipe is built-in or custom
- **⚡ Streamlined UX**: Removed unnecessary operations and toggles for better user experience

## How It Works

### 1. Select a Recipe

When you add the IFC Patch node to your workflow:
1. Click on the **Recipe** dropdown
2. All available recipes are loaded automatically from your IFC Pipeline API
3. Recipes are organized with built-in recipes first, then custom recipes (marked with `[Custom]`)
4. Hover over any recipe to see its description

### 2. Configure Parameters

After selecting a recipe:
- **Input File**: Path to your IFC file (e.g., `/uploads/model.ifc`)
- **Output File**: Where to save the result (e.g., `/output/modified.ifc`)
- **Arguments**: Add recipe-specific arguments as needed (see Recipe Information panel)

### 3. Recipe Information Panel

The node displays helpful information about common recipes and their arguments:
- **ExtractElements**: Requires IFC query (e.g., `.IfcWall`)
- **Optimise**: No arguments needed
- **ResetAbsoluteCoordinates**: No arguments needed
- **ConvertLengthUnit**: Requires target unit (e.g., `METRE`)

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| Input File | String | Yes | Path to the input IFC file |
| Output File | String | Yes | Path for the output IFC file |
| Recipe | Dropdown | Yes | Select from dynamically loaded recipes |
| Arguments | Collection | No | Recipe-specific arguments (add as many as needed) |
| Wait for Completion | Boolean | No | Whether to poll until job finishes (default: true) |
| Polling Interval | Number | No | Seconds between status checks (default: 2) |
| Timeout | Number | No | Maximum wait time in seconds (default: 300) |

## Usage Examples

### Example 1: Extract Walls

```json
{
  "inputFile": "/uploads/building.ifc",
  "outputFile": "/output/walls_only.ifc",
  "recipeName": "ExtractElements",
  "arguments": [
    { "value": ".IfcWall" }
  ]
}
```

### Example 2: Optimize IFC File

```json
{
  "inputFile": "/uploads/large_model.ifc",
  "outputFile": "/output/optimized.ifc",
  "recipeName": "Optimise",
  "arguments": []
}
```

### Example 3: Convert Length Units

```json
{
  "inputFile": "/uploads/model.ifc",
  "outputFile": "/output/metric.ifc",
  "recipeName": "ConvertLengthUnit",
  "arguments": [
    { "value": "METRE" }
  ]
}
```

### Example 4: Custom Recipe

```json
{
  "inputFile": "/uploads/model.ifc",
  "outputFile": "/output/analyzed.ifc",
  "recipeName": "CeilingGrids",
  "arguments": [
    { "value": "analyze" }
  ]
}
```

## What's New in This Version

### ✅ Improvements

1. **Removed "List Recipes" Operation**: No longer needed - recipes load automatically
2. **Removed "Use Custom Recipe" Toggle**: Automatically detected from recipe metadata
3. **Dynamic Recipe Dropdown**: All recipes load from the API with descriptions
4. **Better Recipe Visibility**: Descriptions visible in dropdown hover
5. **Clearer Interface**: Recipe information panel guides users on common arguments
6. **Simpler Arguments**: Streamlined argument input without redundant name field

### 📊 Before vs After

**Before:**
- Manual operation selection
- Separate "List Recipes" operation needed
- Manual toggle for custom recipes
- Generic text input for recipe name
- No visibility into available recipes

**After:**
- Single unified interface
- Recipes load automatically in dropdown
- Custom recipes auto-detected
- Searchable dropdown with descriptions
- Full recipe visibility with helpful information

## Workflow Examples

### Basic Workflow

```
Manual Trigger
  ↓
Set Variables (input/output paths)
  ↓
IFC Patch (select recipe from dropdown)
  ↓
Process Result
```

### Advanced Workflow

```
Upload IFC File
  ↓
IFC Patch (Optimise)
  ↓
IFC Patch (ResetAbsoluteCoordinates)
  ↓
IFC Patch (ExtractElements)
  ↓
Download Result
```

## Available Recipes

### Built-in Recipes (45+)

The node automatically loads all IfcOpenShell built-in recipes including:

- **ExtractElements** - Extract specific IFC elements by query
- **Optimise** - Optimize IFC file size and structure
- **ConvertLengthUnit** - Convert between measurement units
- **MergeProjects** - Merge multiple IFC files
- **Migrate** - Migrate between IFC schemas
- **ResetAbsoluteCoordinates** - Reset coordinate system
- **SplitByBuildingStorey** - Split by building levels
- And 38+ more...

### Custom Recipes

Any custom recipes added to your IFC Pipeline worker are automatically available:
- Marked with `[Custom]` badge in the dropdown
- Loaded dynamically with built-in recipes
- No configuration needed

To add custom recipes, place them in:
```
/path/to/ifc-pipeline/ifcpatch-worker/custom_recipes/
```

## Recipe Arguments Guide

Different recipes require different arguments. Here's a quick reference:

| Recipe | Arguments | Example |
|--------|-----------|---------|
| ExtractElements | IFC query string | `.IfcWall` or `.IfcSlab` |
| ConvertLengthUnit | Target unit | `METRE`, `FOOT`, `MILLIMETRE` |
| MergeProjects | IFC file paths | `/uploads/file1.ifc`, `/uploads/file2.ifc` |
| Optimise | None | - |
| ResetAbsoluteCoordinates | None | - |
| Migrate | Target schema | `IFC4`, `IFC2X3` |

> **Tip**: Hover over the Recipe dropdown to see specific argument requirements for each recipe.

## Job Polling

When "Wait for Completion" is enabled (default), the node automatically polls for job status:

- Checks job status at regular intervals (default: every 2 seconds)
- Returns when job finishes or fails
- Times out after specified duration (default: 300 seconds)
- Shows job progress in execution data

If polling is disabled, the node returns immediately with a `job_id` that you can use to check status later.

## Error Handling

The node provides comprehensive error handling:

- **Recipe Not Found**: Validates recipe exists before execution
- **Invalid Arguments**: Clear error messages for incorrect arguments
- **Job Timeout**: Configurable timeout prevents indefinite waiting
- **Connection Errors**: Graceful handling of API connection issues
- **Continue on Fail**: Option to continue workflow despite errors

## Configuration

### Credentials

1. Add **IFC Pipeline API** credentials
2. Configure:
   - **Base URL**: Your IFC Pipeline URL (e.g., `http://localhost:8000`)
   - **API Key**: Your authentication key

### Node Settings

- **Always Output Data**: Enable to see error details
- **Continue On Fail**: Enable for robust workflows
- **Retry On Fail**: Configure retry attempts

## Tips and Best Practices

### 1. Finding the Right Recipe

Use the search feature in the Recipe dropdown:
- Type keywords to filter recipes
- Read descriptions to understand functionality
- Custom recipes are clearly marked

### 2. Understanding Arguments

- Check the Recipe Information panel for common examples
- Hover over recipe descriptions for specific requirements
- Start with simple recipes (e.g., Optimise) to test your setup

### 3. Chaining Operations

Chain multiple IFC Patch nodes together:
```
IFC Patch (Optimise)
  ↓
IFC Patch (ResetAbsoluteCoordinates)
  ↓
IFC Patch (ExtractElements)
```

### 4. Performance Optimization

- Adjust timeout based on file size
- Use larger polling intervals for long operations
- Consider disabling polling for batch operations

### 5. Testing New Recipes

When exploring new recipes:
1. Start with a small test file
2. Use default timeout settings
3. Check execution output for result details
4. Review IFC Pipeline logs if needed

## Troubleshooting

### Recipes Not Loading

**Problem**: Dropdown shows "Error loading recipes"

**Solutions**:
- Verify API credentials are correct
- Check IFC Pipeline is running and accessible
- Ensure API endpoint `/patch/recipes/list` is available
- Check network connectivity

### Recipe Execution Fails

**Problem**: Job fails or times out

**Solutions**:
- Verify input file exists at specified path
- Check recipe name matches selection
- Ensure arguments are in correct format
- Review IFC Pipeline worker logs: `docker-compose logs ifcpatch-worker`
- Increase timeout for large files

### Custom Recipes Not Appearing

**Problem**: Custom recipe not in dropdown

**Solutions**:
- Verify recipe file is in `custom_recipes/` directory
- Check recipe follows required format
- Restart IFC Pipeline worker
- Check worker logs for loading errors

### Arguments Not Working

**Problem**: Recipe doesn't accept arguments

**Solutions**:
- Check recipe description for required format
- Ensure argument order matches recipe expectations
- Try with simpler values first
- Review recipe documentation

## Monitoring and Debugging

### Execution Data

The node returns detailed execution data:
```json
{
  "job_id": "abc123-def456",
  "status": "finished",
  "result": {
    "success": true,
    "message": "Successfully applied recipe 'ExtractElements'",
    "output_path": "/output/patch/walls.ifc",
    "recipe": "ExtractElements",
    "is_custom": false,
    "output_size_bytes": 1234567,
    "arguments_used": [".IfcWall"]
  }
}
```

### Worker Logs

Monitor IFC Pipeline worker:
```bash
docker-compose logs -f ifcpatch-worker
```

### Job Status

Check job status via API:
```bash
curl -X GET "http://localhost:8000/jobs/{job_id}/status" \
  -H "X-API-Key: your-api-key"
```

## API Integration

The node integrates with these IFC Pipeline endpoints:

- `POST /patch/recipes/list` - Load available recipes (used by dropdown)
- `POST /patch/execute` - Execute a recipe
- `GET /jobs/{job_id}/status` - Check job status (polling)

## Version History

- **v1.1** (Current)
  - Dynamic recipe dropdown with auto-loading
  - Automatic custom recipe detection
  - Improved UX with recipe information panel
  - Removed unnecessary operations
  - Better error handling

- **v1.0**
  - Initial release
  - Manual recipe name input
  - Separate list/execute operations

## Support

For issues or questions:
- Check this README for common solutions
- Review [IfcPatch Documentation](https://docs.ifcopenshell.org/ifcpatch.html)
- Check IFC Pipeline logs
- Review n8n execution data

## License

MIT License - See LICENSE.md for details
