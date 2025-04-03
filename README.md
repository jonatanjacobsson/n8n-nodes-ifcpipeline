![Banner image](https://user-images.githubusercontent.com/10284570/173569848-c624317f-42b1-45a6-ab09-f0ea3c247648.png)

# n8n-nodes-ifcpipeline

This is an n8n community node that lets you use [IfcPipeline](https://github.com/jonatanjacobsson/ifcpipeline) in your n8n workflows.

IfcPipeline provides tools for working with Industry Foundation Classes (IFC) files in Building Information Modeling (BIM) workflows, enabling automation of IFC data processing and analysis.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

[Installation](#installation)  
[Operations](#operations)  
[Credentials](#credentials)  
[Compatibility](#compatibility)  
[Usage](#usage)  
[Resources](#resources)  

## Installation

### Requirements
- Self-hosted n8n instance (community nodes are not available on n8n Cloud)
- n8n version 0.214.0 or newer
- [IfcPipeline](https://github.com/jonatanjacobsson/ifcpipeline)

### Bundled installation
This node comes pre-installed with [IfcPipeline](https://github.com/jonatanjacobsson/ifcpipeline).
For custom setups, see GUI Installation or Manual isntallation below.

### GUI Installation (Recommended)

1. Open your n8n instance
2. Go to **Settings** > **Community Nodes**
3. Click **Install**
4. Enter `n8n-nodes-ifcpipeline` in the "Enter npm package name" field
5. Click **Install**
6. Reload your n8n instance when prompted

### Manual Installation

If you can't use the GUI installation method:

1. Navigate to your n8n user data directory:
   ```
   cd ~/.n8n
   ```

2. If it doesn't exist, create a custom directory:
   ```
   mkdir -p custom/nodes
   ```

3. Install the package:
   ```
   cd custom/nodes
   npm install n8n-nodes-ifcpipeline
   ```

4. Start or restart n8n

## Operations

This package includes the following nodes:

- **IfcPipeline**: Core operations including file upload/download and URL downloading
- **IfcConversion**: Convert between IFC and other formats
- **IfcClash**: Detect clashes between IFC models
- **IfcCsv**: Import/export data between IFC and CSV formats
- **IfcToJson**: Convert IFC data to JSON format
- **IfcTester**: Test and validate IFC models
- **IfcDiff**: Compare differences between IFC models
- **IfcQuantityTakeoff**: Extract quantity information from IFC models

## Credentials

This node requires access to an IFcPipeline API. You'll need to provide:

- **API Key**: Your authorization key for the IFcPipeline API
- **API URL**: The base URL for your IFcPipeline API instance

## Usage

After installation, the IFcPipeline nodes will be available in the nodes panel under "IFcPipeline". You can search for "IFC" to find all related nodes.

### Typical workflow steps:

1. Upload an IFC file using the **IfcPipeline** node or download using native n8n nodes.
2. Process the file using specialized nodes (Conversion, Clash Detection, etc.)
3. Serve or download the processed results or extract data for further use in your workflows.

Each node includes specific options relevant to its function. For example, the IfcClash node allows you to set tolerance levels and detection modes.

## Resources

* [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
* [IFC specification from BuildingSMART](https://technical.buildingsmart.org/standards/ifc)
* [IfcOpenShell](https://ifcopenshell.org/)

## Acknowledgement
This project would not have been possible without the incredible work done by the IfcOpenShell project. Their dedication to creating an open-source IFC parser and toolkit has enabled the development of this node package. We would like to extend our gratitude to the entire IfcOpenShell team for their contributions to the IFC ecosystem.

## License

[MIT](LICENSE.md)
