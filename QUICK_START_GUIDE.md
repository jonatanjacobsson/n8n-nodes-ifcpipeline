# IFC Patch Node - Quick Start Guide

## 🚀 What's New?

The IFC Patch node now features **dynamic recipe loading** - no more typing recipe names manually! All recipes (built-in + custom) are automatically loaded into an easy-to-use dropdown.

## 📝 How to Use (3 Simple Steps)

### 1. Add the Node
Search for "IFC Patch" in n8n and add it to your workflow.

### 2. Configure
```
┌─────────────────────────────────────────────┐
│ Input File:  /uploads/building.ifc         │
│ Output File: /output/modified.ifc          │
│ Recipe: [Click dropdown ▼]                 │
│         • ExtractElements                   │
│         • Optimise                          │
│         • ResetAbsoluteCoordinates         │
│         • CeilingGrids [Custom]            │
│ Arguments: [+Add if needed]                │
└─────────────────────────────────────────────┘
```

### 3. Execute
Run your workflow - the node automatically detects if your recipe is custom or built-in!

## 🎯 Popular Recipes

| Recipe | Purpose | Arguments | Example |
|--------|---------|-----------|---------|
| **ExtractElements** | Extract specific elements | IFC query | `.IfcWall` |
| **Optimise** | Reduce file size | None | - |
| **ConvertLengthUnit** | Change units | Target unit | `METRE` |
| **ResetAbsoluteCoordinates** | Reset coordinates | None | - |

## 💡 Pro Tips

1. **Search Recipes**: Type in the dropdown to filter recipes
2. **Read Descriptions**: Hover over recipes to see what they do
3. **Check Arguments**: Look at the Recipe Information panel for guidance
4. **Custom Recipes**: Marked with `[Custom]` badge

## 🔍 Example Workflow

```
📁 Upload IFC File
    ↓
🔧 IFC Patch (Optimise)
    ↓
🔧 IFC Patch (ExtractElements)
    • Argument: .IfcWall
    ↓
💾 Download Result
```

## ❓ Common Questions

**Q: How do I see available recipes?**  
A: Just click the Recipe dropdown - they load automatically!

**Q: How do I know which recipes are custom?**  
A: Custom recipes are marked with `[Custom]` in the dropdown.

**Q: What arguments does a recipe need?**  
A: Check the Recipe Information panel or hover over the recipe description.

**Q: Do I need to specify if a recipe is custom?**  
A: No! The node detects this automatically.

## 📚 Need More Help?

- Full documentation: `nodes/IfcPatch/README.md`
- Technical details: `IFCPATCH_NODE_IMPROVEMENTS.md`
- Troubleshooting: See README troubleshooting section

## 🎉 Benefits

✅ No typing recipe names  
✅ See all recipes at once  
✅ Descriptions built-in  
✅ Zero configuration for custom recipes  
✅ Faster workflow creation  

Happy building! 🏗️
