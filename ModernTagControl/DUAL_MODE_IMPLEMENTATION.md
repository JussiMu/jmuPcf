# Multi-Mode Relationship Support Implementation

## Overview

The Modern Tag Control now supports **native N:N relationships, intersect table relationships, and Dataverse connection relationships** with clear parameter configuration.

## Configuration Parameters

### Relationship Type Selector
- **relationshipType**: Choose between `"native"` (default), `"intersect"`, or `"connection"`

### Native N:N Relationship Configuration
Use these parameters when `relationshipType` is set to `"native"` (or omitted):

- **relationshipName**: The schema name of the N:N relationship (e.g., `account_product_tags`)
- **primaryEntitySchemaName**: The schema name of the primary entity (e.g., `account`)
- **secondaryEntitySchemaName**: The schema name of the secondary entity/tag entity (e.g., `product`)

### Intersect Table Configuration
Use these parameters when `relationshipType` is set to `"intersect"`:

- **intersectTableName**: The schema name of the custom intersect table (e.g., `new_tagging`)
- **primaryLookupField**: The lookup field to the parent entity (e.g., `new_accountid`)
- **secondaryLookupField**: The lookup field to the tag entity (e.g., `new_tagid`)

### Common Parameters
These apply to all modes:

- **searchFieldName**: The field to search and display for tags (e.g., `name`)
- **allowAutoCreate**: Whether to allow creating new tags on-the-fly (future feature)

### Relationship Type Choice Parameters
These apply to `intersect` and `connection` modes:

- **relationshipTypeFieldName**: Logical name of the choice field in the relationship table
- **relationshipTypeValues**: Comma-separated integer values allowed for creation

If multiple values are configured, the control shows a modal so the user can pick which value to set.

## Implementation Details

### Mode Detection
```typescript
const relationshipType = getStringPropertyRaw(context.parameters.relationshipType).toLowerCase() || "native";
const isIntersectMode = relationshipType === "intersect";
```

### Configuration Validation
The control validates configuration based on the selected mode:

**Native N:N Mode:**
- Requires: `relationshipName`, `primaryEntitySchemaName`, `secondaryEntitySchemaName`, `searchFieldName`

**Intersect Mode:**
- Requires: `intersectTableName`, `primaryLookupField`, `secondaryLookupField`, `intersectNameField`, `relationshipTypeFieldName`, `relationshipTypeValues`, `searchFieldName`

**Connection Mode:**
- Requires: `primaryEntitySchemaName`, `secondaryEntitySchemaName`, `relationshipTypeFieldName`, `relationshipTypeValues`, `searchFieldName`

If configuration is incomplete, the control displays an error message and disables add/remove actions.

### Add Tag Operation

#### Native N:N Mode
Uses Dynamics 365 `Xrm.WebApi.associate()` to create the relationship:
```typescript
await xrmWebApi.associate(
    primaryEntitySchemaName,
    parentRecordId,
    relationshipName,
    secondaryEntitySchemaName,
    tagId
);
```

#### Intersect Mode
Creates a new record in the intersect table with lookup fields:
```typescript
const intersectRecord = {
    [primaryLookupField]: `/accounts(${parentRecordId})`,
    [secondaryLookupField]: `/products(${tagId})`,
};
await context.webAPI.createRecord(intersectTableName, intersectRecord);
```

### Delete Tag Operation

#### Native N:N Mode
Uses Dynamics 365 `Xrm.WebApi.disassociate()` to remove the relationship:
```typescript
await xrmWebApi.disassociate(
    primaryEntitySchemaName,
    parentRecordId,
    relationshipName,
    secondaryEntitySchemaName,
    tagId
);
```

#### Intersect Mode
1. Queries the intersect table to find the record
2. Deletes the intersect record:
```typescript
const query = `?$filter=${primaryLookupField} eq ${parentRecordId} and ${secondaryLookupField} eq ${tagId}`;
const result = await context.webAPI.retrieveMultipleRecords(intersectTableName, query);
if (result.entities && result.entities.length > 0) {
    const intersectRecordId = resolveEntityId(result.entities[0], intersectTableName);
    await context.webAPI.deleteRecord(intersectTableName, intersectRecordId);
}
```

### Bulk Delete
Both modes support bulk deletion of selected tags through `handleDeleteMultipleTags()`.

## Search Behavior

Search queries the **secondary entity** (tags) in both modes using the `searchFieldName`:
- In Native N:N mode: Uses `dataSet.getTargetEntityType()`
- In Intersect mode: Uses `secondaryEntitySchemaName` parameter

## UI Features

1. **Configuration Error Display**: Shows missing parameters in red error text
2. **Disabled Actions**: Add/remove buttons disabled when configuration incomplete
3. **Tooltip on Disabled Add Button**: Shows configuration error message on hover
4. **Debounced Search**: 250ms delay for tag search
5. **Selection UI**: Checkboxes for bulk operations
6. **Loading States**: Visual feedback during operations

## Example Configurations

### Example 1: Native N:N Relationship
```
relationshipType: native (or empty)
relationshipName: account_product_tags
primaryEntitySchemaName: account
secondaryEntitySchemaName: product
searchFieldName: name
```

### Example 2: Intersect Table
```
relationshipType: intersect
intersectTableName: new_tagging
primaryLookupField: new_accountid
secondaryLookupField: new_tagid
secondaryEntitySchemaName: product
searchFieldName: name
```

## Build Status

✅ Build successful (521 KiB bundle)
✅ TypeScript compilation passes
✅ ESLint validation passes (no errors, no warnings)
✅ Platform libraries enabled (React 16.14.0, Fluent UI v9.46.2)

## Testing Recommendations

1. **Test Native N:N Mode**: Configure with existing N:N relationship, test add/remove
2. **Test Intersect Mode**: Configure with custom intersect table, test add/remove
3. **Test Validation**: Try incomplete configurations to verify error messages
4. **Test Bulk Operations**: Select multiple tags and test bulk delete
5. **Test Search**: Verify tag search works in both modes

## Notes

- The control requires Dynamics 365 runtime context (`Xrm.WebApi`) for native N:N operations
- Parent record ID is retrieved from page context (requires control to be on a form)
- Dataset refresh is called after add/remove operations to update the UI
- All API errors are logged to console for debugging
