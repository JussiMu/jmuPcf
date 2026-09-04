# Modern Tag Control for Power Apps PCF

A modern, high-performance Power Apps Component Framework (PCF) control for managing tag relationships in Dynamics 365 and Power Apps. Built with React 16.14.0 and Fluent UI v9, this virtual control supports native N:N relationships, custom intersect tables, and Dataverse connections.

## Features

- ✅ **Three Relationship Modes**: Supports native N:N relationships, custom intersect tables, and Dataverse connections
- ✅ **Modern UI**: Built with Fluent UI v9 components for consistent Microsoft 365 experience
- ✅ **Virtual Control**: Optimized performance with virtual scrolling support
- ✅ **Debounced Search**: Smart 250ms debounced search to reduce API calls
- ✅ **Bulk Operations**: Select and delete multiple tags at once
- ✅ **Platform Libraries**: Uses platform-provided React and Fluent UI (zero bundle bloat)
- ✅ **TypeScript**: Fully typed with strict mode compilation
- ✅ **Responsive**: Adapts to container size and works in forms, views, and dashboards
- ✅ **Accessible**: Full ARIA support for screen readers

## Installation

### Prerequisites

- Power Platform CLI (`pac`) installed
- Node.js 14+ and npm
- Power Apps environment with PCF controls enabled

### Build and Deploy

```powershell
# Navigate to control directory
cd TagControlModern

# Install dependencies
npm install

# Build the control
npm run build

# Push to your environment
pac pcf push --publisher-prefix <your-prefix>
```

## Configuration

The control supports three relationship modes, configured via the `relationshipType` parameter.

### Mode 1: Native N:N Relationship (Default)

Use this mode when you have a native many-to-many relationship between entities.

**Required Parameters:**
- `relationshipType`: Leave empty or set to `"native"`
- `relationshipName`: The schema name of the N:N relationship (e.g., `account_product_tags`)
- `primaryEntitySchemaName`: Primary entity schema name (e.g., `account`)
- `secondaryEntitySchemaName`: Secondary entity/tag entity schema name (e.g., `product`)
- `searchFieldName`: Field to search and display for tags (e.g., `name`)
- `allowAutoCreate`: Enable/disable automatic tag creation (not yet implemented)

**Dataset Binding:**
- Bind `tagDataSet` to the relationship/related records view
- Map `displayField` to the field showing tag names
- Map `recordId` to the unique ID field

**Example Configuration:**
```
Relationship Type: (empty or "native")
Relationship Name: account_product_tags
Primary Entity Schema Name: account
Secondary Entity Schema Name: product
Search Field Name: name
Dataset: Related Products (via account_product_tags relationship)
```

### Mode 2: Intersect Table

Use this mode when you have a custom intersect table instead of a native N:N relationship.

**Required Parameters:**
- `relationshipType`: Set to `"intersect"`
- `intersectTableName`: Schema name of the custom intersect table (e.g., `new_tagging`)
- `primaryEntitySchemaName`: Primary entity schema name (e.g., `account`)
- `secondaryEntitySchemaName`: Secondary entity/tag entity schema name (e.g., `product`)
- `primaryLookupField`: Lookup field to the parent entity in intersect table (e.g., `new_accountid`)
- `secondaryLookupField`: Lookup field to the tag entity in intersect table (e.g., `new_productid`)
- `intersectNameField`: Text field in intersect table where selected tag name is stored (e.g., `new_name`)
- `relationshipTypeFieldName`: Choice field logical name used to classify created relationship records
- `relationshipTypeValues`: Comma-separated integer choice values (for example: `100000000,100000001`)
- `searchFieldName`: Field to search and display for tags (e.g., `name`)
- `allowAutoCreate`: Enable/disable automatic tag creation (not yet implemented)

**Dataset Binding:**
- Bind `tagDataSet` to the intersect table view filtered to current record
- Map `displayField` to the field showing tag names (usually via lookup)
- Map `recordId` to the tag entity's unique ID

**Example Configuration:**
```
Relationship Type: intersect
Intersect Table Name: new_tagging
Primary Entity Schema Name: account
Secondary Entity Schema Name: product
Primary Lookup Field: new_accountid
Secondary Lookup Field: new_productid
Intersect Name Field: new_name
Relationship Type Field Name: new_relationshiptype
Relationship Type Values: 100000000,100000001
Search Field Name: name
Dataset: Custom Tagging view (filtered to current account)
```

### Mode 3: Connection

Use this mode when relationships are stored in the Dataverse `connection` table.

**Required Parameters:**
- `relationshipType`: Set to `"connection"`
- `primaryEntitySchemaName`: Primary entity logical name (current form record entity)
- `secondaryEntitySchemaName`: Related/tag entity logical name
- `relationshipTypeFieldName`: Choice field logical name in `connection`
- `relationshipTypeValues`: Comma-separated integer choice values
- `searchFieldName`: Field to search and display for tags

**Behavior:**
- Adds records to `connection` using `record1id` = current record and `record2id` = selected tag.
- Deletes by `connectionid` from dataset `recordId` mapping.
- If `relationshipTypeValues` contains multiple values, a modal prompts user to choose one before create.

**Dataset Binding:**
- Bind `tagDataSet` to a connection-based view filtered by current record and allowed type values.
- Map `displayField` to related label.
- Map `recordId` to `connectionid`.

## Usage

### Adding Tags

1. Type in the search box to find available tags
2. Search queries the secondary entity (tag table) with debounced filtering
3. Select a tag from the dropdown to add it
4. **Native mode**: Creates N:N relationship via `Xrm.WebApi.associate()`
5. **Intersect mode**: Creates a record in the intersect table with lookup bindings
6. **Connection mode**: Creates a record in Dataverse `connection` and sets configured type field value

### Removing Tags

**Individual Delete:**
- Click the × button on any tag to remove it

**Bulk Delete:**
1. Check the checkboxes next to tags you want to remove
2. Click "Delete Selected" button
3. All selected tags are removed

### Visual Feedback

- **Loading State**: Spinner shown while loading tags or searching
- **Empty State**: "No tags" message when no tags are associated
- **Error Messages**: Clear error messages for configuration issues or API failures
- **Configuration Errors**: Red text showing missing required parameters

## Technical Architecture

### Technology Stack

- **Framework**: Power Apps Component Framework (PCF)
- **UI Framework**: React 16.14.0 (platform-provided)
- **Component Library**: Fluent UI v9.46.2 (platform-provided)
- **Icons**: @fluentui/react-icons v2.0.250
- **Language**: TypeScript 5.8.3 with strict mode
- **Build Tool**: pcf-scripts (Webpack 5)
- **Control Type**: Virtual (optimized for large datasets)

### Performance Optimizations

- **Virtual Control**: Handles large datasets efficiently
- **Debounced Search**: 250ms debounce prevents excessive API calls
- **Memoized Values**: React.useMemo for expensive computations
- **Platform Libraries**: React and Fluent UI loaded from platform (not bundled)
- **Bundle Size**: ~522 KiB (excludes platform libraries)

### API Calls

**Native N:N Mode:**
- **Add**: `Xrm.WebApi.associate()` via OData relationship reference
- **Delete**: `Xrm.WebApi.disassociate()` via OData relationship reference
- **Search**: `context.webAPI.retrieveMultipleRecords()` on secondary entity

**Intersect Mode:**
- **Add**: `context.webAPI.createRecord()` with `@odata.bind` format
- **Delete**: Query intersect table by `_lookupfield_value`, then `context.webAPI.deleteRecord()`
- **Search**: `context.webAPI.retrieveMultipleRecords()` on secondary entity

**Connection Mode:**
- **Add**: `context.webAPI.createRecord("connection")` with `record1id`/`record2id` bindings and configured type value
- **Delete**: `context.webAPI.deleteRecord("connection", connectionid)`
- **Search**: `context.webAPI.retrieveMultipleRecords()` on secondary entity

### Entity Set Name Handling

The control automatically constructs entity set names by pluralizing schema names:
- `account` → `/accounts(...)`
- `product` → `/products(...)`

For custom entities, ensure your `primaryEntitySchemaName` and `secondaryEntitySchemaName` match the logical names used in OData endpoints.

### Multitype/Polymorphic Lookups

The current implementation supports single-entity lookups. For intersect tables with polymorphic lookups:
- Ensure `primaryEntitySchemaName` matches the actual entity type of the parent record
- The control retrieves parent entity type from `context.page.entityTypeName`
- Lookup bindings use the configured entity schema names

## Troubleshooting

### "Configuration incomplete" Error

**Cause**: Required parameters are missing for the selected mode.

**Solution**: 
- Check the error message to see which parameters are missing
- Verify all required fields for your chosen mode (native vs intersect)
- Ensure parameter names match exactly (case-sensitive)

### Tags Not Appearing After Adding

**Cause**: Dataset not refreshing or incorrect relationship binding.

**Solution**:
- Verify dataset is bound to the correct relationship/view
- Check that `displayField` and `recordId` are mapped correctly
- Ensure the view includes the necessary fields
- Try manually refreshing the form

### "Xrm.WebApi not available" Error (Native Mode)

**Cause**: Native N:N mode requires Dynamics 365 runtime context.

**Solution**:
- Verify the control is running in a Dynamics 365 form context
- Check that the form is loaded in a supported host (not test harness)
- Consider using intersect mode if Xrm.WebApi is unavailable

### Search Returns No Results

**Cause**: Incorrect `searchFieldName` or secondary entity configuration.

**Solution**:
- Verify `searchFieldName` matches an actual field on the secondary entity
- Ensure `secondaryEntitySchemaName` is correct
- Check that users have read permissions on the secondary entity
- Test the OData query manually: `/api/data/v9.2/<entity>?$filter=contains(<field>,'test')`

### Delete Fails in Intersect Mode

**Cause**: Incorrect lookup field names or query format.

**Solution**:
- Verify `primaryLookupField` and `secondaryLookupField` are correct
- Check that the query format uses `_<lookupfield>_value` syntax
- Ensure users have delete permissions on the intersect table
- Review browser console for detailed error messages

### Bundle Size Warnings

**Cause**: Fluent UI icon chunks exceed 500KB (expected).

**Solution**: These warnings are expected and don't affect functionality. Icons are code-split by Webpack.

## Browser Support

- Microsoft Edge (Chromium)
- Google Chrome
- Firefox
- Safari (limited testing)

## Accessibility

- Full keyboard navigation support
- ARIA labels for all interactive elements
- Screen reader announcements for state changes
- Focus management in search and selection

## Version History

### 2.0.0 (Current)
- ✅ Modern React + Fluent UI v9 architecture
- ✅ Three-mode support (native N:N, intersect tables, and connection table)
- ✅ Virtual control type for performance
- ✅ Platform library integration
- ✅ Debounced search
- ✅ Bulk delete operations
- ✅ Configuration validation with error messages

### 1.0.0 (Legacy)
- Basic tag control with vanilla TypeScript
- jQuery dependencies
- XMLHttpRequest API calls
- Fluent UI v7

## License

Internal use only - Modirum Platforms / Espoo EKA CRM

## Support

For issues, questions, or feature requests, contact the development team.

## Development

### Prerequisites for Development

```powershell
npm install -g @microsoft/generator-pcf
```

### Local Development

```powershell
# Install dependencies
npm install

# Build
npm run build

# Watch mode (auto-rebuild on changes)
npm start watch

# Test in Test Harness
npm start
```

### Project Structure

```
ModernTagControl/
├── ModernTagControl/
│   ├── ControlManifest.Input.xml    # Control metadata and parameters
│   ├── index.ts                     # PCF entry point (ReactControl)
│   ├── TagControl.tsx               # Main React component
│   ├── css/
│   │   └── ModernTagControl.css     # Custom styles
│   ├── strings/
│   │   ├── ModernTagControl.1033.resx  # English resources
│   │   └── ModernTagControl.1035.resx  # Finnish resources
│   └── generated/
│       └── ManifestTypes.d.ts       # Auto-generated types
├── package.json                     # Dependencies and scripts
├── tsconfig.json                    # TypeScript configuration
└── README.md                        # This file
```

### Code Standards

- TypeScript strict mode enabled
- ESLint with @typescript-eslint rules
- File-level eslint-disable for unavoidable runtime types
- Defensive null checking for dataset access
- Memoized expensive computations
- React functional components with hooks

### Build Output

Built artifacts are in the `out/` directory:
- `ModernTagControl/bundle.js` - Compiled control code
- `ModernTagControl/ControlManifest.xml` - Processed manifest

## Future Enhancements

- [ ] Auto-create new tags when not found in search
- [ ] Drag-and-drop tag reordering
- [ ] Tag categories and filtering
- [ ] Rich tooltips with tag metadata
- [ ] Inline tag editing
- [ ] Tag usage analytics
- [ ] Export/import tag configurations
- [ ] Multi-language resource strings
- [ ] Custom tag colors/icons
- [ ] Tag templates
