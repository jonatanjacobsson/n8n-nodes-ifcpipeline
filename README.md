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

This node requires access to an IfcPipeline API gateway running with
`USE_OBJECT_STORAGE=true` (the S3/MinIO-backed variant of ifcpipeline —
there is no filesystem fallback from 0.7.0 onwards). The credential exposes:

- **Base URL**: The base URL for your IfcPipeline API gateway (e.g. `http://api-gateway` inside Docker, or `https://ifcpipeline.example.com`).
- **API Key**: Your `IFC_PIPELINE_API_KEY`.

The credential `Test` hits `/health` so mis-pointed deployments (e.g. a
legacy filesystem-only gateway) are flagged early.

## Usage

After installation, the IfcPipeline nodes will be available in the nodes panel under "IfcPipeline". You can search for "IFC" to find all related nodes.

### Object-storage model

All file references are S3 object keys under the configured bucket.
Legacy leading slashes and `s3://bucket/...` URIs are tolerated by the
gateway, but the canonical form is a bare key:

| Purpose                  | Example key                                     |
|--------------------------|-------------------------------------------------|
| Uploaded inputs          | `uploads/Building-Architecture.ifc`            |
| `ifccsv` export          | `output/csv/Building-Architecture_export.csv`  |
| `ifccsv` import (updated IFC) | `output/ifc_updated/Building-Architecture_updated.ifc` |
| `ifctester` report       | `output/ids/validation_report.html`            |
| `ifcdiff` report         | `output/diff/comparison_report.json`           |
| `ifcclash` report        | `output/clash/report.json`                     |
| `ifc2json` output        | `output/json/Building-Architecture.json`       |
| `ifcconvert` output      | `output/converted/Building-Architecture.glb`   |
| `ifcpatch` output        | `output/patch/Building-Architecture_patched.ifc`|
| `ifc5d` (QTO) output     | `output/qto/Building-Architecture_with_qtos.ifc`|

### Typical workflow steps:

1. **Upload**: the **IfcPipeline → Upload File** operation streams the file straight into MinIO and returns `{ storage: "s3", bucket, object_key, object_url, file_path, storage_ref }`. `storage_ref` is the canonical, bucket-relative key downstream worker nodes should consume.
2. **Process**: wire `storage_ref` (or any upstream worker's `result.output_key`) into the next node's `filename` / `input_file` / `input_filename` parameter. No prefixes, no mount paths.
3. **Inspect / download**: worker jobs return `{ output_key, output_path: "s3://…/…" }`. **IfcPipeline → Download File** produces a token via `/create_download_link` and follows the resulting 307 redirect to a presigned MinIO URL transparently.

The path-picker dropdown in each node queries `/list_directories`, which the object-storage gateway backs with a paginated `list_objects_v2` over the bucket — so both fresh uploads and worker outputs show up automatically.

## Resources

* [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
* [IFC specification from BuildingSMART](https://technical.buildingsmart.org/standards/ifc)
* [IfcOpenShell](https://ifcopenshell.org/)

## Acknowledgement
This project would not have been possible without the incredible work done by the IfcOpenShell project. Their dedication to creating an open-source IFC parser and toolkit has enabled the development of this node package. We would like to extend our gratitude to the entire IfcOpenShell team for their contributions to the IFC ecosystem.

## License

[MIT](LICENSE.md)
