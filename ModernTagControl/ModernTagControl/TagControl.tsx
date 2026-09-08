/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/prefer-optional-chain */
import * as React from "react";
import {
    Button,
    Checkbox,
    Combobox,
    Dialog,
    DialogActions,
    DialogBody,
    DialogContent,
    DialogSurface,
    DialogTitle,
    Option,
    Spinner,
    Text
} from "@fluentui/react-components";
import type { OptionOnSelectData } from "@fluentui/react-combobox";
import { DismissRegular, DeleteRegular, SelectAllOnRegular } from "@fluentui/react-icons";
import { IInputs } from "./generated/ManifestTypes";

interface TagControlProps {
    context: ComponentFramework.Context<IInputs>;
}

interface TagRecord {
    id: string;
    label: string;
}

interface TagOption {
    id: string;
    label: string;
}

interface PendingSelection {
    id?: string;
    label: string;
    createTag?: boolean;
}

const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_LIMIT = 25;
const entitySetNameCache = new Map<string, string>();

export const TagControl: React.FC<TagControlProps> = ({ context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dataSet = context.parameters.tagDataSet as any;
    const searchFieldName = getStringPropertyRaw(context.parameters.searchFieldName);
    const allowAutoCreate = getBooleanPropertyRaw(context.parameters.allowAutoCreate);
    const prefilterViewId = getStringPropertyRaw(context.parameters.prefilterViewId);

    // Configuration detection for relationship type and intersect tables
    const relationshipType = getStringPropertyRaw(context.parameters.relationshipType).toLowerCase() || "native";
    const isNativeMode = relationshipType === "native";
    const isIntersectMode = relationshipType === "intersect";
    const isConnectionMode = relationshipType === "connection";
    const usesRecordTypeValues = isIntersectMode || isConnectionMode;

    // Native N:N relationship configuration
    const relationshipName = getStringPropertyRaw(context.parameters.relationshipName);
    const primaryEntitySchemaName = getStringPropertyRaw(context.parameters.primaryEntitySchemaName);
    const secondaryEntitySchemaName = getStringPropertyRaw(context.parameters.secondaryEntitySchemaName);

    // Intersect table configuration
    const intersectTableName = getStringPropertyRaw(context.parameters.intersectTableName);
    const primaryLookupField = getStringPropertyRaw(context.parameters.primaryLookupField);
    const secondaryLookupField = getStringPropertyRaw(context.parameters.secondaryLookupField);
    const intersectNameField = getStringPropertyRaw(context.parameters.intersectNameField);
    const relationshipTypeFieldName = getStringPropertyRaw(context.parameters.relationshipTypeFieldName);
    const relationshipTypeValuesRaw = getStringPropertyRaw(context.parameters.relationshipTypeValues);

    const parsedRelationshipTypeValues = React.useMemo(() => parseIntegerCsv(relationshipTypeValuesRaw), [relationshipTypeValuesRaw]);
    const shouldUseRelationshipTypeSelection =
        usesRecordTypeValues &&
        Boolean(relationshipTypeFieldName) &&
        parsedRelationshipTypeValues.values.length > 0;

    const [searchText, setSearchText] = React.useState("");
    const [searchOptions, setSearchOptions] = React.useState<TagOption[]>([]);
    const [searchError, setSearchError] = React.useState<string | null>(null);
    const [isSearching, setIsSearching] = React.useState(false);
    const [isCreatingTag, setIsCreatingTag] = React.useState(false);
    const [selectedTagIds, setSelectedTagIds] = React.useState<Set<string>>(new Set());
    const [isTypeDialogOpen, setIsTypeDialogOpen] = React.useState(false);
    const [isComboboxOpen, setIsComboboxOpen] = React.useState(false);
    const [pendingSelection, setPendingSelection] = React.useState<PendingSelection | null>(null);
    const [relationshipTypeLabels, setRelationshipTypeLabels] = React.useState<Record<number, string>>({});
    const [prefilterFetchXml, setPrefilterFetchXml] = React.useState<string | null>(null);
    // Portaled Fluent popups must stay inside the control so they inherit the FluentProvider theme variables.
    const [portalMountNode, setPortalMountNode] = React.useState<HTMLDivElement | null>(null);
    const actionsEnabled = false;

    const tags = React.useMemo<TagRecord[]>(() => {
        if (!dataSet || !dataSet.sortedRecordIds) {
            return [];
        }
        const recordIds: string[] = dataSet.sortedRecordIds;
        if (recordIds.length === 0) {
            return [];
        }

        return recordIds.map((recordId: string) => {
            const record = dataSet.records[recordId];
            if (!record) {
                return null;
            }
            const labelValue =
                record.getFormattedValue("displayField") ??
                (record.getValue("displayField") as string | null);
            // recordId is already the dataset row's real GUID key, no need to read the bound "recordId" column.
            return {
                id: recordId,
                label: String(labelValue ?? "(Unnamed)")
            };
        }).filter((tag): tag is TagRecord => tag !== null);
    }, [dataSet]);

    const strings = React.useMemo(() => {
        const getString = (key: string, fallback: string) => {
            try {
                return context.resources.getString(key) || fallback;
            } catch {
                return fallback;
            }
        };

        return {
            addTagLabel: getString("AddTag_Label", "Add tag"),
            searchPlaceholder: getString("SearchPlaceholder", "Search to add tags..."),
            selectAllLabel: getString("SelectAll_Label", "Select All"),
            deleteSelectedLabel: getString("DeleteSelected_Label", "Delete Selected"),
            loadingLabel: getString("Loading_Label", "Loading tags..."),
            noTagsLabel: getString("NoTags_Label", "No tags"),
            noTagsDescription: getString("NoTagsDescription", "Start typing to search and add tags"),
            removeTagTooltip: getString("RemoveTag_Tooltip", "Remove tag"),
            errorLoadingTags: getString("Error_LoadingTags", "Failed to load tags"),
            errorSearchFailed: getString("Error_SearchFailed", "Search failed. Please try again."),
            errorInvalidTypeValues: getString("Error_InvalidTypeValues", "Relationship Type Values must be a comma-separated list of integers."),
            chooseTypeTitle: getString("ChooseType_Title", "Select relationship type"),
            chooseTypeMessage: getString("ChooseType_Message", "Choose which relationship type to use for this item."),
            chooseTypeCancel: getString("ChooseType_Cancel", "Cancel"),
            ariaTagList: getString("Aria_TagList", "List of tags"),
            ariaSearchInput: getString("Aria_SearchInput", "Search for tags to add")
        };
    }, [context.resources]);

    React.useEffect(() => {
        const targetEntity = isConnectionMode ? "connection" : isIntersectMode ? intersectTableName : "";
        if (!usesRecordTypeValues || !targetEntity || !relationshipTypeFieldName || parsedRelationshipTypeValues.values.length === 0) {
            setRelationshipTypeLabels({});
            return;
        }

        let isActive = true;
        const loadLabels = async () => {
            const labels = await resolveChoiceValueLabels(targetEntity, relationshipTypeFieldName, parsedRelationshipTypeValues.values);
            if (!isActive) {
                return;
            }
            setRelationshipTypeLabels(labels);
        };

        void loadLabels();

        return () => {
            isActive = false;
        };
    }, [
        isConnectionMode,
        isIntersectMode,
        usesRecordTypeValues,
        intersectTableName,
        relationshipTypeFieldName,
        parsedRelationshipTypeValues,
    ]);

    React.useEffect(() => {
        if (!prefilterViewId || !context.webAPI) {
            setPrefilterFetchXml(null);
            return;
        }

        let isActive = true;
        const loadFetchXml = async () => {
            const fetchXml = await resolveViewFetchXml(context.webAPI, prefilterViewId);
            if (isActive) {
                setPrefilterFetchXml(fetchXml);
            }
        };

        void loadFetchXml();

        return () => {
            isActive = false;
        };
    }, [context.webAPI, prefilterViewId]);

    // Validate configuration based on relationship type
    const isConfigurationValid = React.useMemo(() => {
        if (parsedRelationshipTypeValues.hasInvalidValues) {
            return false;
        }

        if (isIntersectMode) {
            return !!(
                intersectTableName &&
                primaryEntitySchemaName &&
                secondaryEntitySchemaName &&
                primaryLookupField &&
                secondaryLookupField &&
                intersectNameField &&
                searchFieldName
            );
        }

        if (isConnectionMode) {
            return !!(
                primaryEntitySchemaName &&
                secondaryEntitySchemaName &&
                searchFieldName
            );
        }

        if (isNativeMode) {
            return !!(
                relationshipName &&
                primaryEntitySchemaName &&
                secondaryEntitySchemaName &&
                searchFieldName
            );
        }

        return false;
    }, [
        parsedRelationshipTypeValues,
        isNativeMode,
        isIntersectMode,
        isConnectionMode,
        intersectTableName,
        primaryLookupField,
        secondaryLookupField,
        intersectNameField,
        relationshipTypeFieldName,
        relationshipName,
        primaryEntitySchemaName,
        secondaryEntitySchemaName,
        searchFieldName,
    ]);

    // Determine if actions should be enabled
    const configurationError = React.useMemo(() => {
        if (!isConfigurationValid) {
            if (parsedRelationshipTypeValues.hasInvalidValues) {
                return strings.errorInvalidTypeValues;
            }

            if (isIntersectMode) {
                const missing = [];
                if (!intersectTableName) missing.push("Intersect Table Name");
                if (!primaryEntitySchemaName) missing.push("Primary Entity Schema Name");
                if (!secondaryEntitySchemaName) missing.push("Secondary Entity Schema Name (Tag Table)");
                if (!primaryLookupField) missing.push("Primary Lookup Navigation Property");
                if (!secondaryLookupField) missing.push("Secondary Lookup Navigation Property");
                if (!intersectNameField) missing.push("Intersect Name Field");
                if (!searchFieldName) missing.push("Search Field Name");
                return `Configuration incomplete. Missing: ${missing.join(", ")}`;
            }

            if (isConnectionMode) {
                const missing = [];
                if (!primaryEntitySchemaName) missing.push("Primary Entity Schema Name");
                if (!secondaryEntitySchemaName) missing.push("Secondary Entity Schema Name");
                if (!searchFieldName) missing.push("Search Field Name");
                return `Configuration incomplete. Missing: ${missing.join(", ")}`;
            }

            if (isNativeMode) {
                const missing = [];
                if (!relationshipName) missing.push("Relationship Name");
                if (!primaryEntitySchemaName) missing.push("Primary Entity Schema Name");
                if (!secondaryEntitySchemaName) missing.push("Secondary Entity Schema Name");
                if (!searchFieldName) missing.push("Search Field Name");
                return `Configuration incomplete. Missing: ${missing.join(", ")}`;
            }

            return "Configuration incomplete. Unsupported relationship type.";
        }
        return null;
    }, [
        strings.errorInvalidTypeValues,
        parsedRelationshipTypeValues,
        isConfigurationValid,
        isNativeMode,
        isIntersectMode,
        isConnectionMode,
        intersectTableName,
        primaryLookupField,
        secondaryLookupField,
        intersectNameField,
        relationshipTypeFieldName,
        searchFieldName,
        relationshipName,
        primaryEntitySchemaName,
        secondaryEntitySchemaName,
    ]);

    React.useEffect(() => {
        if (!searchText.trim() || !searchFieldName || !dataSet) {
            setSearchOptions([]);
            setSearchError(null);
            return;
        }

        // Determine which entity to search
        let entityType: string = dataSet.getTargetEntityType();
        if ((isIntersectMode || isConnectionMode) && secondaryEntitySchemaName) {
            entityType = secondaryEntitySchemaName;
        }
        entityType = entityType.toLowerCase();

        const searchTerm = searchText.trim();
        const prefilteredFetchXml = prefilterFetchXml
            ? buildPrefilteredFetchXml(prefilterFetchXml, entityType, searchFieldName, searchTerm, SEARCH_LIMIT)
            : null;
        // FetchXML options must be prefixed with "?fetchXml=" and must not be URL-encoded.
        const query = prefilteredFetchXml
            ? `?fetchXml=${prefilteredFetchXml}`
            : `?$select=${searchFieldName}&$filter=contains(${searchFieldName},'${escapeODataValue(searchTerm)}')&$top=${SEARCH_LIMIT}`;
        let isActive = true;

        const debounceId = window.setTimeout(() => {
            const runSearch = async () => {
                setIsSearching(true);
                setSearchError(null);

                try {
                    const result = await context.webAPI.retrieveMultipleRecords(
                        entityType,
                        query,
                        prefilteredFetchXml ? undefined : SEARCH_LIMIT
                    );
                    if (!isActive) {
                        return;
                    }

                    const options = result.entities
                        .map((entity) => {
                            const id = resolveEntityId(entity, entityType);
                            const label = getEntityStringValue(entity, searchFieldName);
                            if (!id || !label) {
                                return null;
                            }
                            return { id, label };
                        })
                        .filter((option): option is TagOption => Boolean(option));
                    setSearchOptions(options);
                } catch {
                    if (!isActive) {
                        return;
                    }
                    setSearchError(strings.errorSearchFailed);
                    setSearchOptions([]);
                } finally {
                    if (isActive) {
                        setIsSearching(false);
                    }
                }
            };

            void runSearch();
        }, SEARCH_DEBOUNCE_MS);

        return () => {
            isActive = false;
            window.clearTimeout(debounceId);
        };
    }, [context.webAPI, dataSet, searchFieldName, searchText, strings.errorSearchFailed, isIntersectMode, isConnectionMode, secondaryEntitySchemaName, prefilterFetchXml]);

    const handleSearchInput = (event: React.ChangeEvent<HTMLInputElement>) => {
        setSearchText(event.target.value);
    };

    const handleOptionSelect = (_event: unknown, data: OptionOnSelectData) => {
        if (!data.optionValue) {
            return;
        }

        const tagId = String(data.optionValue);
        const tagLabel = searchOptions.find((opt) => opt.id === tagId)?.label ?? tagId;

        if (shouldUseRelationshipTypeSelection) {
            if (parsedRelationshipTypeValues.values.length === 1) {
                void handleAddTag(tagId, tagLabel, parsedRelationshipTypeValues.values[0]);
                return;
            }

            if (parsedRelationshipTypeValues.values.length > 1) {
                setPendingSelection({ id: tagId, label: tagLabel });
                setIsTypeDialogOpen(true);
                return;
            }
        }

        void handleAddTag(tagId, tagLabel);
    };

    const toggleSelection = (id: string) => {
        setSelectedTagIds((current) => {
            const next = new Set(current);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const selectAll = () => {
        setSelectedTagIds(new Set(tags.map((tag) => tag.id)));
    };

    const clearSelection = () => {
        setSelectedTagIds(new Set());
    };

    // Get parent record ID and entity type from context
    const parentContext = React.useMemo(() => {
        // Try to get the parent record ID and entity type from the page context
        // This requires the control to be placed on a form
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pageContext = (context as any).page;
        if (pageContext && pageContext.entityId && pageContext.entityTypeName) {
            return {
                recordId: String(pageContext.entityId),
                entityType: String(pageContext.entityTypeName)
            };
        }
        return null;
    }, [context]);

    // Add tag using appropriate relationship type
    const handleAddTag = React.useCallback(
        async (tagId: string, tagLabel: string, relationshipTypeValue?: number) => {
            if (!parentContext || !context.webAPI) {
                console.error("Parent record ID or webAPI not available");
                return;
            }

            try {
                if (isIntersectMode) {
                    // Add via intersect table - create a new record in the intersect table
                    if (!intersectTableName || !primaryLookupField || !secondaryLookupField || !intersectNameField) {
                        console.error("Intersect table configuration incomplete");
                        return;
                    }

                    if (!primaryEntitySchemaName || !secondaryEntitySchemaName) {
                        console.error("Entity schema names required for intersect mode");
                        return;
                    }

                    const [primaryEntitySetName, secondaryEntitySetNameResolved] = await Promise.all([
                        resolveEntitySetName(primaryEntitySchemaName),
                        resolveEntitySetName(secondaryEntitySchemaName),
                    ]);

                    if (!primaryEntitySetName || !secondaryEntitySetNameResolved) {
                        console.error("Could not resolve entity set names for intersect mode");
                        return;
                    }

                    // Use @odata.bind format with resolved entity set names
                    const intersectRecord: Record<string, unknown> = {
                        [`${primaryLookupField}@odata.bind`]: `/${primaryEntitySetName}(${parentContext.recordId})`,
                        [`${secondaryLookupField}@odata.bind`]: `/${secondaryEntitySetNameResolved}(${tagId})`,
                        [intersectNameField]: tagLabel.trim(),
                    };

                    if (relationshipTypeFieldName && relationshipTypeValue !== undefined) {
                        intersectRecord[relationshipTypeFieldName] = relationshipTypeValue;
                    }

                    await context.webAPI.createRecord(intersectTableName, intersectRecord);
                } else if (isConnectionMode) {
                    if (!primaryEntitySchemaName || !secondaryEntitySchemaName) {
                        console.error("Entity schema names required for connection mode");
                        return;
                    }

                    const [primaryEntitySetName, secondaryEntitySetNameResolved] = await Promise.all([
                        resolveEntitySetName(primaryEntitySchemaName),
                        resolveEntitySetName(secondaryEntitySchemaName),
                    ]);

                    if (!primaryEntitySetName || !secondaryEntitySetNameResolved) {
                        console.error("Could not resolve entity set names for connection mode");
                        return;
                    }

                    await createConnectionRecord(
                        context.webAPI,
                        primaryEntitySchemaName,
                        secondaryEntitySchemaName,
                        primaryEntitySetName,
                        secondaryEntitySetNameResolved,
                        parentContext.recordId,
                        tagId,
                        relationshipTypeFieldName,
                        relationshipTypeValue
                    );
                } else {
                    // Add via native N:N relationship using OData $ref
                    if (!relationshipName || !primaryEntitySchemaName || !secondaryEntitySchemaName) {
                        console.error("Native relationship configuration incomplete");
                        return;
                    }

                    await addCollectionRelationship(
                        primaryEntitySchemaName,
                        parentContext.recordId,
                        relationshipName,
                        secondaryEntitySchemaName,
                        tagId
                    );
                }

                // Refresh the dataset to show the new tag
                dataSet?.refresh();
                setSearchText("");
                setSearchOptions([]);
            } catch (error) {
                console.error("Error adding tag:", error);
                setSearchError(`${strings.errorSearchFailed}: ${String(error)}`);
            }
        },
        [
            isConnectionMode,
            isIntersectMode,
            parentContext,
            context.webAPI,
            intersectTableName,
            primaryLookupField,
            secondaryLookupField,
            intersectNameField,
            relationshipTypeFieldName,
            relationshipName,
            primaryEntitySchemaName,
            secondaryEntitySchemaName,
            dataSet,
            strings.errorSearchFailed,
        ]
    );

    const handleCreateTag = React.useCallback(async (relationshipTypeValue?: number) => {
        const tagLabel = searchText.trim();
        if (!allowAutoCreate || !tagLabel || !secondaryEntitySchemaName || !searchFieldName) {
            return;
        }

        if (shouldUseRelationshipTypeSelection && parsedRelationshipTypeValues.values.length > 1 && relationshipTypeValue === undefined) {
            setPendingSelection({ label: tagLabel, createTag: true });
            setIsTypeDialogOpen(true);
            return;
        }

        setIsCreatingTag(true);
        setSearchError(null);
        try {
            const createdTag = await context.webAPI.createRecord(secondaryEntitySchemaName.toLowerCase(), {
                [searchFieldName]: tagLabel,
            });
            if (!createdTag.id) {
                throw new Error("The new tag record did not return an ID");
            }

            const selectedRelationshipTypeValue = relationshipTypeValue ??
                (shouldUseRelationshipTypeSelection ? parsedRelationshipTypeValues.values[0] : undefined);
            await handleAddTag(createdTag.id, tagLabel, selectedRelationshipTypeValue);
        } catch (error) {
            console.error("Error creating tag:", error);
            setSearchError(`${strings.errorSearchFailed}: ${String(error)}`);
        } finally {
            setIsCreatingTag(false);
        }
    }, [
        allowAutoCreate,
        searchText,
        secondaryEntitySchemaName,
        searchFieldName,
        context.webAPI,
        shouldUseRelationshipTypeSelection,
        parsedRelationshipTypeValues,
        handleAddTag,
        strings.errorSearchFailed,
    ]);

    // Delete a tag using appropriate relationship type
    const handleDeleteTag = React.useCallback(
        async (tagId: string) => {
            if (!parentContext || !context.webAPI) {
                console.error("Parent record ID or webAPI not available");
                return;
            }

            try {
                if (isIntersectMode) {
                    // The intersect dataset recordId is the junction record's primary key.
                    if (!intersectTableName) {
                        console.error("Intersect table configuration incomplete");
                        return;
                    }

                    await context.webAPI.deleteRecord(intersectTableName, tagId);
                } else if (isConnectionMode) {
                    await context.webAPI.deleteRecord("connection", tagId);
                } else {
                    // Delete via native N:N relationship
                    if (!relationshipName || !primaryEntitySchemaName || !secondaryEntitySchemaName) {
                        console.error("Native relationship configuration incomplete");
                        return;
                    }

                    await removeCollectionRelationship(
                        primaryEntitySchemaName,
                        parentContext.recordId,
                        relationshipName,
                        tagId
                    );
                }

                // Refresh the dataset to reflect the deletion
                dataSet?.refresh();
                clearSelection();
            } catch (error) {
                console.error("Error deleting tag:", error);
                setSearchError(`${strings.errorSearchFailed}: ${String(error)}`);
            }
        },
        [
            isConnectionMode,
            isIntersectMode,
            parentContext,
            context.webAPI,
            intersectTableName,
            primaryLookupField,
            secondaryLookupField,
            relationshipName,
            primaryEntitySchemaName,
            secondaryEntitySchemaName,
            dataSet,
            strings.errorSearchFailed,
            clearSelection,
        ]
    );

    // Delete multiple tags
    const handleDeleteMultipleTags = React.useCallback(async () => {
        const tagIds = Array.from(selectedTagIds);
        for (const tagId of tagIds) {
            await handleDeleteTag(tagId);
        }
    }, [selectedTagIds, handleDeleteTag]);

    const handleTypeSelect = (selectedValue: number) => {
        if (!pendingSelection) {
            return;
        }

        setIsTypeDialogOpen(false);
        const selection = pendingSelection;
        setPendingSelection(null);
        if (selection.createTag) {
            void handleCreateTag(selectedValue);
            return;
        }

        if (!selection.id) {
            return;
        }
        void handleAddTag(selection.id, selection.label, selectedValue);
    };

    const cancelTypeSelection = () => {
        setIsTypeDialogOpen(false);
        setPendingSelection(null);
    };

    const renderTagList = () => {
        if (!dataSet) {
            return (
                <div className="empty-state">
                    <Text>{strings.noTagsLabel}</Text>
                </div>
            );
        }

        if (dataSet.loading) {
            return (
                <div className="loading-container">
                    <Spinner size="small" />
                    <Text>{strings.loadingLabel}</Text>
                </div>
            );
        }

        if (dataSet.error) {
            return (
                <div className="empty-state">
                    <Text>{strings.errorLoadingTags}</Text>
                    {dataSet.errorMessage ? <Text>{dataSet.errorMessage}</Text> : null}
                </div>
            );
        }

        if (tags.length === 0) {
            return (
                <div className="empty-state">
                    <Text>{strings.noTagsLabel}</Text>
                    <Text>{strings.noTagsDescription}</Text>
                </div>
            );
        }

        return (
            <div className="tag-list-container" aria-label={strings.ariaTagList}>
                {tags.map((tag) => (
                    <div className="tag-item" key={tag.id}>
                        <Checkbox
                            checked={selectedTagIds.has(tag.id)}
                            onChange={() => toggleSelection(tag.id)}
                        />
                        <Button
                            appearance="outline"
                            size="small"
                            icon={<DismissRegular />}
                            aria-label={`${strings.removeTagTooltip} ${tag.label}`}
                            title={strings.removeTagTooltip}
                            disabled={!isConfigurationValid}
                            onClick={() => void handleDeleteTag(tag.id)}
                        >
                            {tag.label}
                        </Button>
                    </div>
                ))}
            </div>
        );
    };

    // Multiple control instances on the same form are DOM siblings with no stacking context of their own,
    // so raise this instance above the others while its popup is open to avoid it rendering underneath them.
    const hasOpenPopup = isComboboxOpen || isTypeDialogOpen;

    return (
        <div
            className={`modern-tag-control-container${hasOpenPopup ? " is-popup-open" : ""}`}
            ref={setPortalMountNode}
        >
            <div className="tag-input-container">
                <Combobox
                    aria-label={strings.ariaSearchInput}
                    placeholder={strings.searchPlaceholder}
                    value={searchText}
                    onInput={handleSearchInput}
                    onOptionSelect={handleOptionSelect}
                    onOpenChange={(_event, data) => setIsComboboxOpen(data.open)}
                    disabled={!searchFieldName}
                    mountNode={portalMountNode}
                >
                    {searchOptions.map((option) => (
                        <Option key={option.id} value={option.id}>
                            {option.label}
                        </Option>
                    ))}
                </Combobox>
                <Button
                    appearance="secondary"
                    disabled={!isConfigurationValid || !allowAutoCreate || !searchText.trim() || isCreatingTag}
                    title={configurationError ?? (allowAutoCreate ? "" : "Automatic tag creation is disabled")}
                    onClick={() => void handleCreateTag()}
                >
                    {strings.addTagLabel}
                </Button>
            </div>

            {configurationError ? <Text className="status-message" style={{ color: "#c42e1f" }}>{configurationError}</Text> : null}
            {searchError ? <Text className="status-message">{searchError}</Text> : null}
            {isSearching ? <Text className="status-message">{strings.loadingLabel}</Text> : null}

            <div className="bulk-actions-container">
                <Button
                    appearance="secondary"
                    size="small"
                    icon={<SelectAllOnRegular />}
                    onClick={selectAll}
                    disabled={tags.length === 0}
                >
                    {strings.selectAllLabel}
                </Button>
                <Button
                    appearance="secondary"
                    size="small"
                    icon={<DeleteRegular />}
                    onClick={() => void handleDeleteMultipleTags()}
                    disabled={!isConfigurationValid || selectedTagIds.size === 0}
                >
                    {strings.deleteSelectedLabel}
                </Button>
            </div>

            <Dialog open={isTypeDialogOpen} onOpenChange={(_event, data) => setIsTypeDialogOpen(data.open)}>
                <DialogSurface mountNode={portalMountNode}>
                    <DialogBody>
                        <DialogTitle>{strings.chooseTypeTitle}</DialogTitle>
                        <DialogContent>
                            <Text>{strings.chooseTypeMessage}</Text>
                            <div className="bulk-actions-container">
                                {parsedRelationshipTypeValues.values.map((value) => (
                                    <Button key={value} appearance="secondary" onClick={() => handleTypeSelect(value)}>
                                        {relationshipTypeLabels[value] ?? String(value)}
                                    </Button>
                                ))}
                            </div>
                        </DialogContent>
                        <DialogActions>
                            <Button appearance="secondary" onClick={cancelTypeSelection}>{strings.chooseTypeCancel}</Button>
                        </DialogActions>
                    </DialogBody>
                </DialogSurface>
            </Dialog>

            {renderTagList()}
        </div>
    );
};

interface IntegerCsvParseResult {
    values: number[];
    hasInvalidValues: boolean;
}

const parseIntegerCsv = (csvValue: string): IntegerCsvParseResult => {
    if (!csvValue.trim()) {
        return { values: [], hasInvalidValues: false };
    }

    const tokens = csvValue.split(",").map((token) => token.trim()).filter((token) => token.length > 0);
    if (tokens.length === 0) {
        return { values: [], hasInvalidValues: false };
    }

    const values: number[] = [];
    for (const token of tokens) {
        if (!/^-?\d+$/.test(token)) {
            return { values: [], hasInvalidValues: true };
        }

        const parsed = Number.parseInt(token, 10);
        if (Number.isNaN(parsed)) {
            return { values: [], hasInvalidValues: true };
        }

        values.push(parsed);
    }

    return {
        values: Array.from(new Set(values)),
        hasInvalidValues: false,
    };
};

const resolveEntityId = (entity: ComponentFramework.WebApi.Entity, entityType: string): string | null => {
    const entityIdKey = `${entityType}id`;
    const entityRecord = entity as Record<string, unknown>;
    const rawId = entityRecord[entityIdKey];
    const fallbackId = entityRecord.id;
    const idValue = typeof rawId === "string" ? rawId : typeof fallbackId === "string" ? fallbackId : null;
    if (!idValue) {
        return null;
    }
    return String(idValue);
};

const escapeODataValue = (value: string): string => value.replace(/'/g, "''");

const viewFetchXmlCache = new Map<string, string | null>();

const resolveViewFetchXml = async (
    webApi: ComponentFramework.WebApi,
    viewId: string
): Promise<string | null> => {
    const normalizedViewId = viewId.trim().replace(/[{}]/g, "").toLowerCase();
    if (!normalizedViewId) {
        return null;
    }

    const cachedFetchXml = viewFetchXmlCache.get(normalizedViewId);
    if (cachedFetchXml !== undefined) {
        return cachedFetchXml;
    }

    try {
        const view = await webApi.retrieveRecord("savedquery", normalizedViewId, "?$select=fetchxml");
        const fetchXml = typeof view.fetchxml === "string" ? view.fetchxml : null;
        viewFetchXmlCache.set(normalizedViewId, fetchXml);
        return fetchXml;
    } catch (error) {
        console.warn(`Unable to resolve fetchxml for view ${normalizedViewId}`, error);
        viewFetchXmlCache.set(normalizedViewId, null);
        return null;
    }
};

// Wraps the view's existing filter (if any) together with a search condition so both criteria apply.
const buildPrefilteredFetchXml = (
    fetchXml: string,
    entityType: string,
    searchFieldName: string,
    searchText: string,
    top: number
): string | null => {
    try {
        const doc = new DOMParser().parseFromString(fetchXml, "application/xml");
        if (doc.getElementsByTagName("parsererror").length > 0) {
            return null;
        }

        const fetchNode = doc.documentElement;
        fetchNode.setAttribute("top", String(top));
        fetchNode.removeAttribute("page");
        fetchNode.removeAttribute("count");
        fetchNode.removeAttribute("paging-cookie");

        const entityNode = fetchNode.getElementsByTagName("entity")[0];
        if (!entityNode) {
            return null;
        }

        // The view's entity must match what we're about to query, otherwise the prefilter can't apply.
        const fetchEntityName = entityNode.getAttribute("name")?.toLowerCase();
        if (fetchEntityName !== entityType.toLowerCase()) {
            console.warn(`Prefilter view entity "${fetchEntityName ?? ""}" does not match search entity "${entityType}"; ignoring prefilter.`);
            return null;
        }

        // The view may not project the search field, but we need it back to build the option label.
        const hasAllAttributes = entityNode.getElementsByTagName("all-attributes").length > 0;
        const hasSearchFieldAttribute = Array.from(entityNode.childNodes).some(
            (node): node is Element =>
                node.nodeType === 1 &&
                (node as Element).tagName === "attribute" &&
                (node as Element).getAttribute("name")?.toLowerCase() === searchFieldName.toLowerCase()
        );
        if (!hasAllAttributes && !hasSearchFieldAttribute) {
            const attributeNode = doc.createElement("attribute");
            attributeNode.setAttribute("name", searchFieldName);
            entityNode.appendChild(attributeNode);
        }

        const existingFilterNode = Array.from(entityNode.childNodes).find(
            (node): node is Element => node.nodeType === 1 && (node as Element).tagName === "filter"
        );

        const combinedFilterNode = doc.createElement("filter");
        combinedFilterNode.setAttribute("type", "and");
        if (existingFilterNode) {
            entityNode.removeChild(existingFilterNode);
            combinedFilterNode.appendChild(existingFilterNode);
        }

        const conditionNode = doc.createElement("condition");
        conditionNode.setAttribute("attribute", searchFieldName);
        conditionNode.setAttribute("operator", "like");
        conditionNode.setAttribute("value", `%${searchText}%`);
        combinedFilterNode.appendChild(conditionNode);

        entityNode.appendChild(combinedFilterNode);

        return new XMLSerializer().serializeToString(doc);
    } catch (error) {
        console.warn("Unable to apply prefilter view to fetchxml", error);
        return null;
    }
};

const getEntityStringValue = (entity: ComponentFramework.WebApi.Entity, fieldName: string): string | null => {
    const record = entity as Record<string, unknown>;
    const value = record[fieldName];
    return typeof value === "string" ? value : null;
};

const getStringPropertyRaw = (value: unknown): string => {
    if (!value || typeof value !== "object") {
        return "";
    }

    const rawValue = (value as { raw?: unknown }).raw;
    return typeof rawValue === "string" ? rawValue : "";
};

const getBooleanPropertyRaw = (value: unknown): boolean => {
    if (!value || typeof value !== "object") {
        return false;
    }

    const rawValue = (value as { raw?: unknown }).raw;
    return rawValue === true || rawValue === 1 || rawValue === "true" || rawValue === "1";
};

const resolveChoiceValueLabels = async (
    entityLogicalName: string,
    fieldLogicalName: string,
    values: number[]
): Promise<Record<number, string>> => {
    const labels: Record<number, string> = {};
    if (!entityLogicalName || !fieldLogicalName || values.length === 0) {
        return labels;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const xrmUtility = (window as any).Xrm?.Utility;
    if (!xrmUtility?.getEntityMetadata) {
        return labels;
    }

    try {
        const metadata = await xrmUtility.getEntityMetadata(entityLogicalName, [fieldLogicalName]);
        const metadataRecord = metadata as Record<string, unknown>;
        const attributes = (metadataRecord.Attributes as unknown[]) ?? [];
        const attribute = attributes.find((attr) => {
            const attributeRecord = attr as Record<string, unknown>;
            return attributeRecord.LogicalName === fieldLogicalName;
        }) as Record<string, unknown> | undefined;

        const optionSet = attribute?.OptionSet as Record<string, unknown> | undefined;
        const options = (optionSet?.Options as unknown[]) ?? [];
        for (const option of options) {
            const optionRecord = option as Record<string, unknown>;
            const value = optionRecord.Value;
            if (typeof value !== "number" || !values.includes(value)) {
                continue;
            }

            const labelRecord = optionRecord.Label as Record<string, unknown> | undefined;
            const userLocalized = labelRecord?.UserLocalizedLabel as Record<string, unknown> | undefined;
            const label = userLocalized?.Label;
            if (typeof label === "string" && label) {
                labels[value] = label;
            }
        }
    } catch (error) {
        console.warn(`Unable to resolve choice labels for ${entityLogicalName}.${fieldLogicalName}`, error);
    }

    return labels;
};

const resolveEntitySetName = async (entityLogicalName: string): Promise<string> => {
    const normalizedLogicalName = entityLogicalName.trim().toLowerCase();
    if (!normalizedLogicalName) {
        return "";
    }

    const cachedEntitySetName = entitySetNameCache.get(normalizedLogicalName);
    if (cachedEntitySetName) {
        return cachedEntitySetName;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const xrmUtility = (window as any).Xrm?.Utility;
    if (xrmUtility?.getEntityMetadata) {
        try {
            const metadata = await xrmUtility.getEntityMetadata(normalizedLogicalName);
            const metadataRecord = metadata as Record<string, unknown>;
            const entitySetName =
                (typeof metadataRecord.EntitySetName === "string" && metadataRecord.EntitySetName) ||
                (typeof metadataRecord.entitySetName === "string" && metadataRecord.entitySetName) ||
                "";

            if (entitySetName) {
                entitySetNameCache.set(normalizedLogicalName, entitySetName);
                return entitySetName;
            }
        } catch (error) {
            console.warn(`Unable to resolve entity set metadata for ${normalizedLogicalName}`, error);
        }
    }

    const fallbackEntitySetName = `${normalizedLogicalName}s`;
    entitySetNameCache.set(normalizedLogicalName, fallbackEntitySetName);
    return fallbackEntitySetName;
};

const removeCollectionRelationship = async (
    primaryEntityLogicalName: string,
    primaryRecordId: string,
    relationshipName: string,
    relatedRecordId: string
): Promise<void> => {
    const primaryEntitySetName = await resolveEntitySetName(primaryEntityLogicalName);
    if (!primaryEntitySetName) {
        throw new Error(`Could not resolve entity set name for ${primaryEntityLogicalName}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const xrmUtility = (window as any).Xrm?.Utility;
    const clientUrl = xrmUtility?.getGlobalContext?.().getClientUrl?.();
    if (!clientUrl) {
        throw new Error("Xrm.Utility.getGlobalContext is not available for relationship operations");
    }

    const response = await window.fetch(
        `${clientUrl}/api/data/v9.2/${primaryEntitySetName}(${primaryRecordId})/${relationshipName}(${relatedRecordId})/$ref`,
        {
            method: "DELETE",
            headers: {
                Accept: "application/json",
                "OData-MaxVersion": "4.0",
                "OData-Version": "4.0",
            },
            credentials: "same-origin",
        }
    );

    if (!response.ok) {
        throw new Error(`Failed to remove relationship: ${response.status} ${response.statusText}`);
    }
};

const addCollectionRelationship = async (
    primaryEntityLogicalName: string,
    primaryRecordId: string,
    relationshipName: string,
    relatedEntityLogicalName: string,
    relatedRecordId: string
): Promise<void> => {
    const [primaryEntitySetName, relatedEntitySetName] = await Promise.all([
        resolveEntitySetName(primaryEntityLogicalName),
        resolveEntitySetName(relatedEntityLogicalName),
    ]);
    if (!primaryEntitySetName || !relatedEntitySetName) {
        throw new Error("Could not resolve entity set names for the relationship operation");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const xrmUtility = (window as any).Xrm?.Utility;
    const clientUrl = xrmUtility?.getGlobalContext?.().getClientUrl?.();
    if (!clientUrl) {
        throw new Error("Xrm.Utility.getGlobalContext is not available for relationship operations");
    }

    const response = await window.fetch(
        `${clientUrl}/api/data/v9.2/${primaryEntitySetName}(${primaryRecordId})/${relationshipName}/$ref`,
        {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                "OData-MaxVersion": "4.0",
                "OData-Version": "4.0",
            },
            credentials: "same-origin",
            body: JSON.stringify({
                "@odata.id": `${clientUrl}/api/data/v9.2/${relatedEntitySetName}(${relatedRecordId})`,
            }),
        }
    );

    if (!response.ok) {
        throw new Error(`Failed to add relationship: ${response.status} ${response.statusText}`);
    }
};

const createConnectionRecord = async (
    webApi: ComponentFramework.WebApi,
    primaryEntityLogicalName: string,
    secondaryEntityLogicalName: string,
    primaryEntitySetName: string,
    secondaryEntitySetName: string,
    primaryRecordId: string,
    secondaryRecordId: string,
    relationshipTypeFieldName?: string,
    relationshipTypeValue?: number
): Promise<void> => {
    const record1Candidates = [`record1id_${primaryEntityLogicalName.toLowerCase()}`, "record1id"];
    const record2Candidates = [`record2id_${secondaryEntityLogicalName.toLowerCase()}`, "record2id"];

    let lastError: unknown = null;
    for (const record1Field of record1Candidates) {
        for (const record2Field of record2Candidates) {
            const payload: Record<string, unknown> = {
                [`${record1Field}@odata.bind`]: `/${primaryEntitySetName}(${primaryRecordId})`,
                [`${record2Field}@odata.bind`]: `/${secondaryEntitySetName}(${secondaryRecordId})`,
            };

            if (relationshipTypeFieldName && relationshipTypeValue !== undefined) {
                payload[relationshipTypeFieldName] = relationshipTypeValue;
            }

            try {
                await webApi.createRecord("connection", payload);
                return;
            } catch (error) {
                lastError = error;
            }
        }
    }

    if (lastError instanceof Error) {
        throw lastError;
    }
    throw new Error("Failed to create connection record");
};
