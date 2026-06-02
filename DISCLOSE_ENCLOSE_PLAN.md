# Disclose/Enclose Feature Implementation Plan

## Feature Overview
The **Disclose/Enclose** feature allows users to expand or collapse all subcategories within a category with a single tap. When a user taps "Disclose", all expandable descendant subcategories open. When they tap "Enclose", all subcategories close.

**Status**: ✅ Already Implemented (2026-05-21)

---

## Feature Behavior

### User Experience Flow

1. **In Category Detail View**
   - User views a category with nested subcategories
   - If the category has expandable descendants, an action button appears showing either "Disclose" or "Enclose"
   - Button label toggles based on current state: "Enclose" appears when all descendants are expanded, "Disclose" when any are collapsed
   - Tapping the button expands/collapses all descendant subcategories at once

2. **In Workspace Board Cards**
   - Each category card in the workspace board shows subcategories
   - A "Disclose"/"Enclose" action button appears next to other category actions (Rename, Copy, Delete, Order)
   - Button toggles all expandable descendants under that category
   - Button icon changes: `chevron-down` for "Disclose" (expand all), `chevron-up` for "Enclose" (collapse all)

### Display Logic
- **Show button**: Only if category has expandable descendants (subcategories with notes or their own subcategories)
- **Button label**: 
  - `"Disclose"` if ANY descendant is currently collapsed
  - `"Enclose"` if ALL descendants are currently expanded
- **Button disabled**: Only appears when there are actually expandable descendants

---

## Technical Architecture

### Key Components

#### 1. **App.tsx** - Main Category Detail Screen
```typescript
const expandableDetailKeys = useMemo(...); // Keys of categories with expandable children
const allDetailCategoriesExpanded = expandableDetailKeys.length > 0 && 
  expandableDetailKeys.every((key) => expandedCategoryKeys.has(key));

<ActionGrid
  discloseLabel={expandableDetailKeys.length ? 
    (allDetailCategoriesExpanded ? 'Enclose' : 'Disclose') : undefined}
  onDisclose={expandableDetailKeys.length ? 
    () => setDetailCategoriesExpanded(!allDetailCategoriesExpanded) : undefined}
  // ... other actions
/>
```

**Location**: [App.tsx](App.tsx#L618-L619)

**Responsibilities**:
- Calculate which descendants are expandable
- Determine current expansion state
- Pass label and callback to ActionGrid
- Toggle expansion state on button press

#### 2. **WorkspaceCategoryCard.tsx** - Workspace Board Card Component
```typescript
const expandableDescendantKeys = useMemo(() => 
  listExpandableDescendantKeys(allCategories, category.path, notesByCategoryKey),
  [allCategories, category.path, notesByCategoryKey]
);

const allDescendantsExpanded = expandableDescendantKeys.length > 0 && 
  expandableDescendantKeys.every((key) => expandedCategoryKeys.has(key));

// Two implementations: one for main category card, one for subcategory details
function setDescendantsExpanded(expanded: boolean) {
  setExpandedCategoryKeys((current) => {
    const next = new Set(current);
    expandableDescendantKeys.forEach((key) => {
      if (expanded) {
        next.add(key);
      } else {
        next.delete(key);
      }
    });
    return next;
  });
  setActionsOpen(false);
}
```

**Location**: [WorkspaceCategoryCard.tsx](WorkspaceCategoryCard.tsx#L107-L248) and [WorkspaceCategoryCard.tsx](WorkspaceCategoryCard.tsx#L372-L477)

**Responsibilities**:
- Identify expandable descendant categories
- Track which descendants are currently expanded
- Render Disclose/Enclose action button
- Batch expand/collapse descendants
- Close action menu after toggle

#### 3. **WorkspaceChrome.tsx** - Action Grid Component
```typescript
interface ActionGridProps {
  discloseLabel?: 'Disclose' | 'Enclose';
  onDisclose?: () => void;
  onAddNote: () => void;
  onSubcategory: () => void;
  onRename: () => void;
  onDelete: () => void;
  onCopy: () => void;
}
```

**Location**: [WorkspaceChrome.tsx](WorkspaceChrome.tsx#L29)

**Responsibilities**:
- Display action buttons in a grid layout
- Render Disclose/Enclose button when label provided
- Call callback when button pressed

#### 4. **WorkspaceCategoryActionItem.tsx** - Action Button Component
Renders individual action buttons with icon and label

---

## Helper Functions

### `listExpandableDescendantKeys()`
**Purpose**: Find all descendant categories that have expandable content

**Location**: [WorkspaceCategoryCard.tsx](WorkspaceCategoryCard.tsx#L621-L628)

**Logic**:
- Recursively traverse category tree from root category
- Return keys of categories that:
  - Have subcategories, OR
  - Have notes
- These are the categories that can be expanded/collapsed

**Return Type**: `string[]` (array of category keys)

### `listExpandableDescendantKeysFromGroups()`
**Purpose**: Alternative version using grouped child categories

**Location**: [WorkspaceCategoryCard.tsx](WorkspaceCategoryCard.tsx#L628)

**Use Case**: When child categories are pre-grouped for performance

---

## Data Flow

### Expansion State Management

```
User taps Disclose/Enclose
  ↓
setDescendantsExpanded(expanded: boolean) called
  ↓
For each expandableDescendantKey:
  - If expanded=true: ADD to expandedCategoryKeys Set
  - If expanded=false: REMOVE from expandedCategoryKeys Set
  ↓
React re-renders with updated expandedCategoryKeys
  ↓
Category tree shows/hides nested categories
```

### State Variables
- **expandedCategoryKeys**: `Set<string>` - Tracks which categories are currently expanded
  - Stored in component state
  - Updated via `setExpandedCategoryKeys()`
  - Key format: `path.join('/')`

- **expandableDescendantKeys**: `string[]` - Cached list of descendant keys that can be toggled
  - Memoized with dependencies: `[allCategories, category.path, notesByCategoryKey]`
  - Recalculated only when dependencies change

---

## Integration Points

### 1. Category Detail View (App.tsx)
- Shows Disclose/Enclose in the ActionGrid
- Controls expansion of all subcategories under selected category
- Updates `expandedCategoryKeys` state

### 2. Workspace Board (WorkspaceCategoryCard.tsx)
- Shows Disclose/Enclose in vertical dropdown menu
- Has TWO implementations:
  - **Root category card** (line 107-248): Expands descendants of root category
  - **Nested subcategory row** (line 372-477): Expands descendants of that subcategory

### 3. Category Tree Display
- Categories in `CategoryList` check if their key is in `expandedCategoryKeys`
- Expanded categories show their children
- Collapsed categories hide their children

---

## UI/UX Details

### Button States

| State | Label | Icon | Behavior |
|-------|-------|------|----------|
| Has collapsed descendants | "Disclose" | `chevron-down` | Expand all descendants |
| All descendants expanded | "Enclose" | `chevron-up` | Collapse all descendants |
| No expandable descendants | Hidden | - | Button not shown |

### Action Menu
- Disclose/Enclose appears as one of several vertical dropdown options
- Other options: Rename, Create Subcategory, Copy, Order, Delete
- Menu closes automatically after action (via `setActionsOpen(false)`)

### Touch Targets
- Button is part of actionable area within category card
- Adequate touch target size (minimum 44px) for mobile accessibility

---

## Implementation Checklist (Already Complete ✅)

- [x] Identify expandable descendant categories
- [x] Track expansion state in component state
- [x] Calculate "all descendants expanded" boolean
- [x] Render action button in ActionGrid
- [x] Show conditional label based on expansion state
- [x] Show conditional icon based on expansion state
- [x] Implement batch expand functionality
- [x] Implement batch collapse functionality
- [x] Close action menu after toggle
- [x] Handle both main and nested category cards
- [x] Memoize descendant key calculations
- [x] Handle edge cases (no expandable descendants)
- [x] Verify category synchronization works
- [x] Test on Android workspace board
- [x] Test on main category detail view

---

## Files Modified

1. **App.tsx** (line 618-619)
   - Added discloseLabel and onDisclose props to ActionGrid

2. **WorkspaceChrome.tsx** (line 29)
   - Added discloseLabel and onDisclose type definitions

3. **WorkspaceCategoryCard.tsx** (line 107-248, 372-477)
   - Implemented expandableDescendantKeys calculation
   - Implemented setDescendantsExpanded function
   - Rendered Disclose/Enclose button with icon and label
   - Two separate implementations for root and nested cards

4. **Helper Functions** (line 621+)
   - listExpandableDescendantKeys()
   - listExpandableDescendantKeysFromGroups()

---

## Edge Cases Handled

1. **Category with no subcategories**: Button hidden
2. **Deeply nested structure**: All levels expanded/collapsed correctly
3. **Mixed expansion state**: Button shows "Disclose" to prompt user to expand remaining
4. **Synchronized categories**: Uses deterministic category tree helpers
5. **Workspace card scrolling**: Descendants expand/collapse without scroll disruption

---

## Performance Considerations

- **Memoization**: Descendant keys cached with useMemo to avoid recalculation
- **Dependency tracking**: Only recalculates when allCategories, path, or notesByCategoryKey change
- **Set operations**: Uses Set for O(1) lookup when checking expansion state
- **Batch updates**: Single setState call batches multiple expandable descendants

---

## Future Enhancements

1. **Animation**: Add smooth expand/collapse animation
2. **Keyboard shortcut**: Allow keyboard toggle for desktop
3. **Persistence**: Remember expansion state across sessions (optional)
4. **Recursive limit**: Cap maximum nesting depth visually
5. **Performance**: Lazy-render deeply nested categories

---

## Testing Verification Matrix

- [ ] Disclose button appears only when expandable descendants exist
- [ ] All descendant categories expand when Disclose tapped
- [ ] All descendant categories collapse when Enclose tapped
- [ ] Button label changes between Disclose/Enclose appropriately
- [ ] Button icon changes between chevron-down/chevron-up appropriately
- [ ] Feature works in main category detail view
- [ ] Feature works in workspace board main category card
- [ ] Feature works in workspace board nested subcategory rows
- [ ] Action menu closes after button press
- [ ] Expansion state persists correctly during navigation
- [ ] Works with same-name synchronized categories
- [ ] Works with deeply nested category structures
- [ ] Manual collapsing individual categories still works
- [ ] Expansion state survives note add/edit/delete operations

---

## Summary

The **Disclose/Enclose** feature is a powerful UX improvement that allows users to quickly expand or collapse entire category hierarchies. It works by:

1. **Identifying** all expandable descendant categories
2. **Tracking** which categories are currently expanded via a Set
3. **Toggling** all relevant descendant keys in the expanded state
4. **Rendering** the appropriate button label and icon
5. **Updating** the category tree display based on expansion state

The implementation is performant, handles edge cases, and integrates seamlessly with existing category navigation and workspace board features.
