import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatAuthTimeout, neverAuthTimeoutHours } from '../auth/authSession';
import { collapseExactNameCategories, formatPath, listAllCategories } from '../categories/categoryTree';
import { listNotesAtPath } from '../notes/noteMutations';
import { sortPinnedNotesFirst } from '../notes/pinnedNotes';
import { useTheme } from '../../shared/design/ThemeProvider';
import { colors, rounded, spacing, typography } from '../../shared/design/tokens';
import { CategoryPath, CategorySummary, FlatNote, NotesData, WorkspaceMeta } from '../../shared/types/notes';
import { EmptyState } from '../../shared/ui/EmptyState';
import { Icon } from '../../shared/ui/Icon';
import { WorkspaceCategoryCard } from './WorkspaceCategoryCard';
import { WorkspaceCategoryPickerRow } from './WorkspaceCategoryPickerRow';
import { ZoomableCategorySlot } from './ZoomableCategorySlot';

type Props = {
  data: NotesData;
  workspaces: WorkspaceMeta[];
  activeWorkspace: WorkspaceMeta | null;
  activeWorkspaceId: string;
  defaultWorkspaceId: string;
  saving: boolean;
  refreshing: boolean;
  floatingActionsVisible: boolean;
  authTimeoutHours: number;
  onSelectWorkspace: (workspaceId: string) => void;
  onSetDefaultWorkspace: (workspaceId: string) => void;
  onCreateWorkspace: () => void;
  onRenameWorkspace: () => void;
  onRefresh: () => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onOpenAiChat: () => void;
  onOpenAiNotifications: () => void;
  onOpenAi: () => void;
  onOpenAiWorkspace: () => void;
  onAuthTimeoutChange: (hours: number) => Promise<void> | void;
  onLogout: () => void;
  onOpenCategory: (path: CategoryPath) => void;
  onCreateRootCategory: () => void;
  onToggleCategory: (path: CategoryPath) => void;
  onSetCategoryPriority: (path: CategoryPath, priority: number, visibleCategoryPaths?: CategoryPath[]) => void;
  onSetSubcategoryPriority: (path: CategoryPath, priority: number) => void;
  onAddNote: (path: CategoryPath, text: string) => Promise<boolean> | boolean;
  onCreateSubcategory: (path: CategoryPath) => void;
  onCopyCategory: (path: CategoryPath) => void;
  onRenameCategory: (path: CategoryPath) => void;
  onDeleteCategory: (path: CategoryPath) => void;
  onEditNote: (note: FlatNote) => void;
  onMoveNote: (note: FlatNote) => void;
  onCopyNote: (note: FlatNote) => void;
  onCopyNoteText: (note: FlatNote) => void;
  onSetNotePriority: (note: FlatNote, priority: number) => void;
  onToggleNotePin: (note: FlatNote) => void;
  onDeleteNote: (note: FlatNote) => void;
};

export function WorkspaceBoard({
  data,
  workspaces,
  activeWorkspace,
  activeWorkspaceId,
  defaultWorkspaceId,
  saving,
  refreshing,
  floatingActionsVisible,
  authTimeoutHours,
  onSelectWorkspace,
  onSetDefaultWorkspace,
  onCreateWorkspace,
  onRenameWorkspace,
  onRefresh,
  onOpenSearch,
  onOpenSettings,
  onOpenAiChat,
  onOpenAiNotifications,
  onOpenAi,
  onOpenAiWorkspace,
  onAuthTimeoutChange,
  onLogout,
  onOpenCategory,
  onCreateRootCategory,
  onToggleCategory,
  onSetCategoryPriority,
  onSetSubcategoryPriority,
  onAddNote,
  onCreateSubcategory,
  onCopyCategory,
  onRenameCategory,
  onDeleteCategory,
  onEditNote,
  onMoveNote,
  onCopyNote,
  onCopyNoteText,
  onSetNotePriority,
  onToggleNotePin,
  onDeleteNote,
}: Props) {
  const { colors, isDark, toggleTheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [authHoursText, setAuthHoursText] = useState(formatAuthTimeoutInput(authTimeoutHours));
  const [authHoursStatus, setAuthHoursStatus] = useState<string | null>(null);
  const [priorityMenuKey, setPriorityMenuKey] = useState<string | null>(null);
  const [categoryActionsKey, setCategoryActionsKey] = useState<string | null>(null);
  const [categorySearch, setCategorySearch] = useState('');
  const rawCategories = useMemo(() => listAllCategories(data), [data]);
  const visibleCategories = useMemo(() => collapseExactNameCategories(rawCategories), [rawCategories]);
  const selectedPaths = activeWorkspace?.selectedCategoryPaths ?? [];
  const pinnedNotes = activeWorkspace?.pinnedNotes ?? [];
  const rawCategoriesByKey = new Map(rawCategories.map((category) => [pathKey(category.path), category]));
  const visibleCategoriesByName = new Map(visibleCategories.map((category) => [category.name, category]));
  const visibleCategoriesByKey = new Map(visibleCategories.map((category) => [pathKey(category.path), category]));
  const notesByCategoryKey = new Map(rawCategories.map((category) => [pathKey(category.path), sortPinnedNotesFirst(listNotesAtPath(data, category.path), pinnedNotes)]));
  const selectedCategoryRows = selectedPaths.flatMap((path) => {
    const rawCategory = rawCategoriesByKey.get(pathKey(path));
    const category = rawCategory ? visibleCategoriesByName.get(rawCategory.name) : visibleCategoriesByKey.get(pathKey(path));
    return category ? [category] : [];
  });
  const boardCategories = selectedCategoryRows.length ? removeDescendantCategories(selectedCategoryRows) : visibleCategories.filter((category) => category.path.length === 1);
  const prioritizedCategories = boardCategories.map((category, index) => ({ category, priority: index + 1, notes: notesByCategoryKey.get(pathKey(category.path)) ?? [] }));
  const categorySearchText = categorySearch.trim().toLowerCase();
  const pickerCategories = visibleCategories
    .filter((category) => {
      if (!categorySearchText) return true;
      return category.name.toLowerCase().includes(categorySearchText) || formatPath(category.path).toLowerCase().includes(categorySearchText);
    })
    .map((category, index) => ({ category, index, selectedIndex: findVisibleCategoryIndex(boardCategories, category) }))
    .sort((left, right) => {
      const leftSelected = left.selectedIndex >= 0;
      const rightSelected = right.selectedIndex >= 0;
      if (leftSelected && rightSelected) return left.selectedIndex - right.selectedIndex;
      if (leftSelected) return -1;
      if (rightSelected) return 1;
      return compareCategoriesAlphabetically(left.category, right.category) || left.index - right.index;
    });

  function setCategoryPriority(path: CategoryPath, priority: number) {
    setPriorityMenuKey(null);
    setCategoryActionsKey(null);
    onSetCategoryPriority(path, priority, boardCategories.map((category) => category.path));
  }

  function closeHeaderMenus() {
    setShowHeaderMenu(false);
    setShowWorkspaceMenu(false);
  }

  function reloadRecentData() {
    setShowCategoryPicker(false);
    setPriorityMenuKey(null);
    setCategoryActionsKey(null);
    closeHeaderMenus();
    onRefresh();
  }

  async function submitAuthHours() {
    const nextHours = Number(authHoursText);
    if (!Number.isFinite(nextHours) || nextHours <= 0) {
      setAuthHoursText(formatAuthTimeoutInput(authTimeoutHours));
      setAuthHoursStatus('Enter hours');
      return;
    }
    const roundedHours = Math.round(nextHours);
    await onAuthTimeoutChange(roundedHours);
    setAuthHoursText(String(roundedHours));
    setAuthHoursStatus('Saved');
  }

  useEffect(() => {
    setAuthHoursText(formatAuthTimeoutInput(authTimeoutHours));
  }, [authTimeoutHours]);

  useEffect(() => {
    if (!floatingActionsVisible) {
      setShowCategoryPicker(false);
      setPriorityMenuKey(null);
      setCategoryActionsKey(null);
      closeHeaderMenus();
    }
  }, [floatingActionsVisible]);

  return (
    <View style={styles.wrap}>
      {floatingActionsVisible ? (
        <View style={styles.floatingCategoryActions}>
          <Pressable accessibilityRole="button" accessibilityLabel="Create category" onPress={onCreateRootCategory} style={styles.categoryAddButton}>
            <Icon name="add" size={18} color={colors.onPrimary} />
          </Pressable>
          <View style={styles.categoryShownControl}>
            <Pressable accessibilityRole="button" accessibilityLabel="Shown categories" onPress={() => setShowCategoryPicker((current) => !current)} style={styles.categoryShownButton}>
              <Icon name="albums-outline" size={17} color={colors.primary} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Open shown categories" onPress={() => setShowCategoryPicker((current) => !current)} style={styles.categoryShownArrowButton}>
              <Icon name="chevron-down" size={13} color={colors.primary} />
            </Pressable>
          </View>
          <View style={styles.floatingMenuWrap}>
            <Pressable accessibilityRole="button" accessibilityLabel="Reload recent data" disabled={refreshing} onPress={reloadRecentData} style={[styles.reloadButton, refreshing && styles.reloadButtonDisabled]}>
              <Icon name="reload-outline" size={17} color={refreshing ? colors.stone : colors.ink} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'} onPress={toggleTheme} style={[styles.reloadButton, isDark && styles.themeButtonActive]}>
              <Icon name="sunny-outline" size={18} color={isDark ? colors.onPrimary : colors.ink} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showHeaderMenu ? 'Close workspace controls' : 'Open workspace controls'}
              onPress={() => {
                setShowHeaderMenu((current) => !current);
                setShowWorkspaceMenu(false);
              }}
              style={[styles.disclosureButton, showHeaderMenu && styles.disclosureButtonOpen]}
            >
              <Icon name={showHeaderMenu ? 'chevron-forward' : 'chevron-down'} size={17} color={showHeaderMenu ? colors.onPrimary : colors.ink} />
            </Pressable>
            {showHeaderMenu ? (
              <View style={styles.headerMenu}>
                <View style={styles.headerMenuTitleBlock}>
                  <Text style={styles.headerMenuKicker}>Workspace</Text>
                  <Text style={styles.headerMenuTitle} numberOfLines={1}>{activeWorkspace?.name ?? 'Workspace'}</Text>
                </View>

                <Pressable accessibilityRole="button" accessibilityLabel="Open settings" onPress={() => { closeHeaderMenus(); onOpenSettings(); }} style={styles.headerMenuRow}>
                  <View style={styles.headerMenuRowIcon}><Icon name="settings-outline" size={16} color={colors.ink} /></View>
                  <Text style={styles.headerMenuRowText} numberOfLines={1}>Settings</Text>
                </Pressable>

                <Pressable accessibilityRole="button" accessibilityLabel="Open search" onPress={() => { closeHeaderMenus(); onOpenSearch(); }} style={styles.headerMenuRow}>
                  <View style={styles.headerMenuRowIcon}><Icon name="search-outline" size={16} color={colors.ink} /></View>
                  <Text style={styles.headerMenuRowText} numberOfLines={1}>Search</Text>
                </Pressable>

                <Pressable accessibilityRole="button" accessibilityLabel="Open AI chat" onPress={() => { closeHeaderMenus(); onOpenAiChat(); }} style={styles.headerMenuRow}>
                  <View style={styles.headerMenuRowIcon}><Icon name="sparkles-outline" size={16} color={colors.ink} /></View>
                  <Text style={styles.headerMenuRowText} numberOfLines={1}>AI Chat</Text>
                </Pressable>

                <Pressable accessibilityRole="button" accessibilityLabel="Open AI notifications" onPress={() => { closeHeaderMenus(); onOpenAiNotifications(); }} style={styles.headerMenuRow}>
                  <View style={styles.headerMenuRowIcon}><Icon name="notifications-outline" size={16} color={colors.ink} /></View>
                  <Text style={styles.headerMenuRowText} numberOfLines={1}>AI Notifications</Text>
                </Pressable>

                <Pressable accessibilityRole="button" accessibilityLabel="Open AI Review" onPress={() => { closeHeaderMenus(); onOpenAi(); }} style={styles.headerMenuRow}>
                  <View style={styles.headerMenuRowIcon}><Icon name="sparkles-outline" size={16} color={colors.ink} /></View>
                  <Text style={styles.headerMenuRowText} numberOfLines={1}>AI Review</Text>
                </Pressable>

                <Pressable accessibilityRole="button" accessibilityLabel="Open AI workspace" onPress={() => { closeHeaderMenus(); onOpenAiWorkspace(); }} style={styles.headerMenuRow}>
                  <View style={styles.headerMenuRowIcon}><Icon name="albums-outline" size={16} color={colors.ink} /></View>
                  <Text style={styles.headerMenuRowText} numberOfLines={1}>AI WORKSPACE</Text>
                </Pressable>

                <Pressable accessibilityRole="button" accessibilityLabel="Log out" onPress={() => { closeHeaderMenus(); onLogout(); }} style={styles.headerMenuRow}>
                  <View style={styles.headerMenuRowIcon}><Icon name="log-out-outline" size={16} color={colors.ink} /></View>
                  <Text style={styles.headerMenuRowText} numberOfLines={1}>Logout</Text>
                </Pressable>

                <View style={styles.authTimeoutRow}>
                  <View style={styles.authTimeoutTextBlock}>
                    <Text style={styles.headerMenuKicker}>Password</Text>
                    <Text style={styles.authTimeoutText} numberOfLines={1}>{formatAuthTimeout(authTimeoutHours)}</Text>
                  </View>
                  <TextInput
                    accessibilityLabel="Password timeout hours"
                    value={authHoursText}
                    onChangeText={(text) => { setAuthHoursStatus(null); setAuthHoursText(text.replace(/[^0-9]/g, '')); }}
                    onSubmitEditing={submitAuthHours}
                    onBlur={() => setAuthHoursText(authHoursText || formatAuthTimeoutInput(authTimeoutHours))}
                    keyboardType="number-pad"
                    returnKeyType="done"
                    placeholder={authTimeoutHours === neverAuthTimeoutHours ? 'Never' : undefined}
                    placeholderTextColor={colors.stone}
                    maxLength={2}
                    selectTextOnFocus
                    style={styles.authTimeoutInput}
                  />
                  <Pressable accessibilityRole="button" accessibilityLabel="Save password timeout hours" onPress={submitAuthHours} style={styles.authTimeoutSaveButton}>
                    <Icon name="checkmark" size={12} color={colors.onPrimary} />
                  </Pressable>
                  {authHoursStatus ? <Text style={styles.authTimeoutStatus}>{authHoursStatus}</Text> : null}
                </View>

                <View style={styles.workspaceMenuWrap}>
                  <Pressable accessibilityRole="button" accessibilityLabel="Choose workspace" onPress={() => setShowWorkspaceMenu((current) => !current)} style={styles.workspaceMenuButton}>
                    <View style={styles.headerMenuRowIcon}><Icon name="folder-outline" size={16} color={colors.ink} /></View>
                    <Text style={styles.workspaceMenuButtonText} numberOfLines={1}>{activeWorkspace?.name ?? 'Workspace'}</Text>
                    <Icon name="chevron-down" size={13} color={colors.slate} />
                  </Pressable>
                  {showWorkspaceMenu ? (
                    <View style={styles.workspaceMenu}>
                      {workspaces.map((workspace) => {
                        const active = workspace.id === activeWorkspaceId;
                        const isDefault = workspace.id === defaultWorkspaceId;
                        return (
                          <Pressable
                            key={workspace.id}
                            accessibilityRole="button"
                            accessibilityLabel={`Open ${workspace.name}`}
                            onPress={() => { closeHeaderMenus(); onSelectWorkspace(workspace.id); }}
                            style={[styles.workspaceMenuItem, active && styles.workspaceMenuItemActive]}
                          >
                            <Text style={[styles.workspaceMenuItemText, active && styles.workspaceMenuItemTextActive]} numberOfLines={1}>{workspace.name}</Text>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={isDefault ? `${workspace.name} is the default workspace` : `Make ${workspace.name} the default workspace`}
                              disabled={isDefault}
                              onPress={(event) => { event.stopPropagation(); onSetDefaultWorkspace(workspace.id); }}
                              style={[styles.defaultWorkspaceButton, isDefault && styles.defaultWorkspaceButtonActive]}
                            >
                              <Icon name="checkmark" size={12} color={isDefault ? colors.onPrimary : colors.slate} />
                            </Pressable>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                </View>

                <Pressable accessibilityRole="button" accessibilityLabel="Rename workspace" onPress={() => { closeHeaderMenus(); onRenameWorkspace(); }} style={styles.headerMenuRow}>
                  <View style={styles.headerMenuRowIcon}><Icon name="create-outline" size={16} color={colors.ink} /></View>
                  <Text style={styles.headerMenuRowText} numberOfLines={1}>Edit workspace</Text>
                </Pressable>

                <View accessibilityLabel={`${prioritizedCategories.length} categories`} style={styles.headerMenuRowStatic}>
                  <View style={styles.cardCountBox}>
                    <Text style={styles.cardCountText}>{prioritizedCategories.length}</Text>
                  </View>
                  <Text style={styles.headerMenuRowText} numberOfLines={1}>No. of categories</Text>
                </View>

                <Pressable accessibilityRole="button" accessibilityLabel="Create workspace" onPress={() => { closeHeaderMenus(); onCreateWorkspace(); }} style={[styles.headerMenuRow, styles.headerMenuRowPrimary]}>
                  <View style={styles.headerMenuRowPrimaryIcon}><Icon name="add" size={17} color={colors.onPrimary} /></View>
                  <Text style={styles.headerMenuRowPrimaryText} numberOfLines={1}>New workspace</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}
      <View style={styles.header}>
        <View style={styles.headerTitleBlock}>
          {saving ? <Text style={styles.meta}>Saving</Text> : refreshing ? <Text style={styles.meta}>Reloading</Text> : null}
        </View>
      </View>

      {showCategoryPicker ? (
        <View style={styles.paneLayer}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close shown categories" onPress={() => { setShowCategoryPicker(false); setPriorityMenuKey(null); setCategoryActionsKey(null); }} style={styles.paneScrim} />
          <View style={styles.categoryPane}>
            <View style={styles.paneHeader}>
              <View style={styles.paneTitleBlock}>
                <Text style={styles.paneKicker}>Shown</Text>
                <Text style={styles.paneTitle}>Categories</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close shown categories" onPress={() => { setShowCategoryPicker(false); setPriorityMenuKey(null); setCategoryActionsKey(null); }} style={styles.paneCloseButton}>
                <Icon name="close" size={13} color={colors.steel} />
              </Pressable>
            </View>

            <TextInput
              accessibilityLabel="Search shown categories"
              value={categorySearch}
              onChangeText={(text) => { setPriorityMenuKey(null); setCategoryActionsKey(null); setCategorySearch(text); }}
              placeholder="Search categories"
              placeholderTextColor={colors.stone}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              style={styles.categorySearchInput}
            />

            <ScrollView style={styles.paneScroll} contentContainerStyle={styles.paneList} nestedScrollEnabled showsVerticalScrollIndicator>
              {pickerCategories.length ? pickerCategories.map(({ category, selectedIndex }) => {
                const key = pathKey(category.path);
                const selected = selectedIndex >= 0;
                const priority = selected ? selectedIndex + 1 : prioritizedCategories.length + 1;
                const menuOpen = priorityMenuKey === key;
                const priorityOptions = Array.from({ length: Math.max(prioritizedCategories.length, 1) + (selected ? 0 : 1) }, (_, index) => index + 1);
                return (
                  <WorkspaceCategoryPickerRow
                    key={key}
                    category={category}
                    selected={selected}
                    priority={priority}
                    priorityOptions={priorityOptions}
                    priorityMenuOpen={menuOpen}
                    actionsMenuOpen={categoryActionsKey === key}
                    colors={colors}
                    onToggleCategory={(path) => { setPriorityMenuKey(null); setCategoryActionsKey(null); onToggleCategory(path); }}
                    onTogglePriorityMenu={() => { setCategoryActionsKey(null); setPriorityMenuKey(menuOpen ? null : key); }}
                    onSetPriority={setCategoryPriority}
                    onToggleActionsMenu={() => { setPriorityMenuKey(null); setCategoryActionsKey(categoryActionsKey === key ? null : key); }}
                    onCreateSubcategory={(path) => { setShowCategoryPicker(false); setPriorityMenuKey(null); setCategoryActionsKey(null); onCreateSubcategory(path); }}
                  />
                );
              }) : <Text style={styles.emptyPickerText}>{categorySearchText ? 'No matching categories.' : 'Create a category to show it here.'}</Text>}
            </ScrollView>
          </View>
        </View>
      ) : null}

      {rawCategories.length === 0 ? (
        <EmptyState title="No categories yet" message="Create a category to start this workspace." actionLabel="New category" onAction={onCreateRootCategory} />
      ) : prioritizedCategories.length === 0 ? (
        <EmptyState title="No cards selected" message="Choose categories for this workspace board." actionLabel="Choose categories" onAction={() => setShowCategoryPicker(true)} />
      ) : (
        <View style={styles.grid}>
          {prioritizedCategories.map(({ category, notes, priority }, index) => (
            <ZoomableCategorySlot key={pathKey(category.path)} index={index} styles={styles}>
              {(zoom) => (
                <WorkspaceCategoryCard
                  category={category}
                  allCategories={rawCategories}
                  notesByCategoryKey={notesByCategoryKey}
                  notes={notes}
                  pinnedNotes={pinnedNotes}
                  priority={priority}
                  workspaceName={activeWorkspace?.name ?? 'Workspace'}
                  showWorkspaceIntro={priority === 1}
                  zoom={zoom}
                  onOpen={() => onOpenCategory(category.path)}
                  onOpenCategory={onOpenCategory}
                  onAddNote={onAddNote}
                  onCreateSubcategory={onCreateSubcategory}
                  onCopyCategory={onCopyCategory}
                  onSetSubcategoryPriority={onSetSubcategoryPriority}
                  onRenameCategory={onRenameCategory}
                  onDeleteCategory={onDeleteCategory}
                  onEditNote={onEditNote}
                  onMoveNote={onMoveNote}
                  onCopyNote={onCopyNote}
                  onCopyNoteText={onCopyNoteText}
                  onSetNotePriority={onSetNotePriority}
                  onToggleNotePin={onToggleNotePin}
                  onDeleteNote={onDeleteNote}
                />
              )}
            </ZoomableCategorySlot>
            ))}
          </View>
        )}
      </View>
    );
  }

function pathKey(path: CategoryPath) {
  return path.join('\u001f');
}

function removeDescendantCategories(categories: CategorySummary[]) {
  return categories.filter((category) => !categories.some((candidate) => isAncestorPath(candidate.path, category.path)));
}

function findVisibleCategoryIndex(categories: CategorySummary[], category: CategorySummary) {
  return categories.findIndex((item) => pathKey(item.path) === pathKey(category.path) || item.name === category.name);
}

function compareCategoriesAlphabetically(left: CategorySummary, right: CategorySummary) {
  return formatPath(left.path).localeCompare(formatPath(right.path), undefined, { sensitivity: 'base' });
}

function isAncestorPath(candidate: CategoryPath, path: CategoryPath) {
  return candidate.length < path.length && candidate.every((segment, index) => path[index] === segment);
}

function formatAuthTimeoutInput(hours: number) {
  return hours === neverAuthTimeoutHours ? '' : String(hours);
}

const boardCardGutter = 1;
const boardCardHalfGutter = boardCardGutter / 2;
const shownCategoryVisibleRows = 7;
const shownCategoryRowHeight = 52;
const shownCategoryRowGap = spacing.xs;
const shownCategoryListMaxHeight = shownCategoryVisibleRows * shownCategoryRowHeight + (shownCategoryVisibleRows - 1) * shownCategoryRowGap;
function createStyles(colors: typeof import('../../shared/design/tokens').colors) {
  return StyleSheet.create({
  wrap: { position: 'relative', gap: spacing.xs },
  floatingCategoryActions: { position: 'absolute', top: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, zIndex: 80, elevation: 10 },
  header: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', justifyContent: 'space-between', zIndex: 50 },
  headerTitleBlock: { flex: 1, minWidth: 0 },
  meta: { ...typography.bodySm, color: colors.slate },
  disclosureButton: { width: 46, height: 46, borderRadius: rounded.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline },
  disclosureButtonOpen: { backgroundColor: colors.inkDeep, borderColor: colors.inkDeep },
  headerMenu: { position: 'absolute', top: 44, right: 0, width: 240, borderRadius: rounded.md, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.canvas, padding: spacing.xs, gap: spacing.xs, zIndex: 90, elevation: 12 },
  headerMenuTitleBlock: { borderBottomWidth: 1, borderBottomColor: colors.hairlineSoft, paddingHorizontal: spacing.xs, paddingBottom: spacing.xs, minWidth: 0 },
  headerMenuKicker: { ...typography.micro, color: colors.primary, textTransform: 'uppercase' },
  headerMenuTitle: { ...typography.bodySmMedium, color: colors.ink },
  headerMenuRow: { minHeight: 38, borderRadius: rounded.md, paddingHorizontal: spacing.xs, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.hairlineSoft },
  headerMenuRowStatic: { minHeight: 38, borderRadius: rounded.md, paddingHorizontal: spacing.xs, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.cardTintYellow, borderWidth: 1, borderColor: colors.brandYellow },
  headerMenuRowPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  headerMenuRowIcon: { width: 24, height: 24, borderRadius: rounded.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, flexShrink: 0 },
  headerMenuRowPrimaryIcon: { width: 24, height: 24, borderRadius: rounded.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryDeep, flexShrink: 0 },
  headerMenuRowText: { ...typography.bodySmMedium, color: colors.charcoal, flex: 1, minWidth: 0 },
  headerMenuRowPrimaryText: { ...typography.bodySmMedium, color: colors.onPrimary, flex: 1, minWidth: 0 },
  authTimeoutRow: { minHeight: 48, borderRadius: rounded.md, paddingHorizontal: spacing.xs, paddingVertical: spacing.xs, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.hairlineSoft },
  authTimeoutTextBlock: { flex: 1, minWidth: 0 },
  authTimeoutText: { ...typography.bodySmMedium, color: colors.charcoal },
  authTimeoutInput: { width: 44, height: 32, borderRadius: rounded.sm, borderWidth: 1, borderColor: colors.hairlineStrong, backgroundColor: colors.canvas, color: colors.ink, textAlign: 'center', paddingHorizontal: spacing.xs, paddingVertical: 0, ...typography.bodySmMedium },
  authTimeoutSaveButton: { width: 30, height: 30, borderRadius: rounded.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, flexShrink: 0 },
  authTimeoutStatus: { ...typography.micro, color: colors.primary, minWidth: 36, textAlign: 'right' },
  categoryAddButton: { width: 34, height: 34, borderRadius: rounded.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, flexShrink: 0 },
  categoryShownControl: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 0 },
  categoryShownButton: { width: 34, height: 34, borderRadius: rounded.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline, flexShrink: 0 },
  categoryShownArrowButton: { width: 24, height: 34, borderRadius: rounded.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline, flexShrink: 0 },
  floatingMenuWrap: { position: 'relative', zIndex: 90, elevation: 12, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  reloadButton: { width: 46, height: 46, borderRadius: rounded.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline },
  reloadButtonDisabled: { opacity: 0.55 },
  themeButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  cardCountBox: { width: 30, height: 30, borderRadius: rounded.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardTintYellowBold, borderWidth: 1, borderColor: colors.brandYellow, flexShrink: 0 },
  cardCountText: { ...typography.captionBold, color: colors.charcoal },
  workspaceMenuWrap: { position: 'relative', zIndex: 100, elevation: 14 },
  workspaceMenuButton: { minHeight: 38, borderRadius: rounded.md, paddingHorizontal: spacing.xs, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs, backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.hairlineSoft },
  workspaceMenuButtonText: { ...typography.bodySmMedium, color: colors.charcoal, flex: 1, minWidth: 0 },
  workspaceMenu: { position: 'absolute', top: 42, right: 0, left: 0, maxHeight: 220, borderRadius: rounded.md, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.canvas, padding: 4, gap: 2, zIndex: 120, elevation: 16 },
  workspaceMenuItem: { minHeight: 34, borderRadius: rounded.sm, paddingHorizontal: spacing.xs, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  workspaceMenuItemActive: { backgroundColor: colors.inkDeep },
  workspaceMenuItemText: { ...typography.micro, color: colors.charcoal, flex: 1, minWidth: 0 },
  workspaceMenuItemTextActive: { color: colors.onDark },
  defaultWorkspaceButton: { width: 26, height: 26, borderRadius: rounded.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface },
  defaultWorkspaceButtonActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  paneLayer: { position: 'absolute', top: 46, left: 0, right: 0, bottom: 0, minHeight: 560, zIndex: 60 },
  paneScrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(10,21,48,0.18)' },
  categoryPane: { position: 'absolute', top: 0, left: 0, bottom: 0, width: 306, maxWidth: '92%', borderTopRightRadius: rounded.lg, borderBottomRightRadius: rounded.lg, borderWidth: 1, borderLeftWidth: 0, borderColor: colors.hairline, backgroundColor: colors.canvas, padding: spacing.sm, gap: spacing.sm },
  paneHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  paneTitleBlock: { flex: 1, minWidth: 0 },
  paneKicker: { ...typography.micro, color: colors.primary, textTransform: 'uppercase' },
  paneTitle: { ...typography.heading5, color: colors.ink },
  paneCloseButton: { width: 32, height: 32, borderRadius: rounded.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface },
  categorySearchInput: { minHeight: 40, borderRadius: rounded.md, borderWidth: 1, borderColor: colors.hairlineStrong, backgroundColor: colors.surfaceSoft, color: colors.ink, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, ...typography.bodySm },
  paneScroll: { flexGrow: 0, maxHeight: shownCategoryListMaxHeight },
  paneList: { gap: spacing.xs, paddingBottom: spacing.xl },
  emptyPickerText: { ...typography.bodySm, color: colors.slate, paddingVertical: spacing.md, paddingHorizontal: spacing.xs },
  grid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', marginVertical: -boardCardHalfGutter },
  cardSlot: { width: '50%', minWidth: 0, paddingVertical: boardCardHalfGutter },
  cardSlotLeft: { paddingLeft: 0, paddingRight: boardCardHalfGutter },
  cardSlotRight: { paddingLeft: boardCardHalfGutter, paddingRight: 0 },
  cardSlotZoomed: { zIndex: 30, elevation: 8, paddingLeft: 0, paddingRight: 0 },
  });
}
