import { CategoryPath, NotesData } from '../../shared/types/notes';
import { buildCategoryContext, buildWorkspaceCatalog, buildWorkspaceJsonContext } from './contextBuilder';

export const aiSystemPrompt = `You are the AI assistant inside a personal note-taking app.

Core philosophy:
- Capture loosely.
- Review deliberately.
- Recommend clearly.
- Do not over-categorize.
- Do not create deep category trees unless the notes truly need them.
- Never discard a note.
- AI recommends; the user confirms; the app applies deterministic changes.

The app stores notes as simple nested JSON:
{
  "Category": [
    "note text",
    { "Subcategory": ["note text"] }
  ]
}

Return JSON only when asked for JSON. Otherwise answer naturally and practically.`;

export function buildChatMessages(question: string, context: string) {
  return [
    { role: 'system' as const, content: aiSystemPrompt },
    { role: 'user' as const, content: `Context:\n${context || 'No note context selected.'}\n\nQuestion:\n${question}` },
  ];
}

export function buildClassifyNoteMessages(note: string, catalog: string) {
  return [
    { role: 'system' as const, content: aiSystemPrompt },
    { role: 'user' as const, content: `Classify this raw personal note. Do not over-categorize. Return only valid JSON with: cleaned_text, type, area, project, tags, next_action, review_priority, reason. Tags maximum 3.\n\nExisting category catalog:\n${catalog}\n\nRaw note:\n${note}` },
  ];
}

export function buildCategoryRequestMessages(data: NotesData, parentPath: CategoryPath, request: string) {
  return [
    { role: 'system' as const, content: aiSystemPrompt },
    { role: 'user' as const, content: `Create a helpful category request from the notes. Return only valid JSON with: parent_path, new_category_name, mode, reason, items. mode must be copy or move. items must contain source_path and exact note text. Prefer copy mode unless the request explicitly asks to move.\n\nParent path:\n${JSON.stringify(parentPath)}\n\nCategory catalog:\n${buildWorkspaceCatalog(data)}\n\nRelevant parent notes:\n${buildCategoryContext(data, parentPath)}\n\nUser request:\n${request}` },
  ];
}

export function buildGenerateWorkspaceMessages(data: NotesData, sourceWorkspaceName: string, userGoal: string) {
  return [
    { role: 'system' as const, content: aiSystemPrompt },
    { role: 'user' as const, content: `Generate a complete new AI workspace JSON from the source workspace.

Rules:
- Return only valid JSON with keys: workspace_name, rationale, data.
- data must be valid app NotesData: root category names map to arrays of note strings or single-key nested category objects.
- Leave no note aside.
- Do not delete any note.
- Every source note should appear in the generated data.
- Prefer broad useful views over deep taxonomy.
- Use categories like Inbox, Actions, Projects, Self Manual, Content Studio, Health & Body, Money, Career, Relationships, Library, Archive when useful.
- Preserve the original note text as much as possible.
- Do not include markdown fences.

Source workspace name: ${sourceWorkspaceName}
User goal: ${userGoal || 'Create a simpler useful AI workspace for review, action, and clarity.'}

Source JSON:
${buildWorkspaceJsonContext(data)}` },
  ];
}

export function buildDistillChunkMessages(chunk: string) {
  return [
    { role: 'system' as const, content: aiSystemPrompt },
    { role: 'user' as const, content: `Summarize this chunk of notes for later synthesis. Keep exact useful themes, actions, repeated ideas, and category overlaps.\n\n${chunk}` },
  ];
}

export function buildFinalSynthesisMessages(question: string, summaries: string[]) {
  return [
    { role: 'system' as const, content: aiSystemPrompt },
    { role: 'user' as const, content: `Answer the user's question from these note summaries.\n\nQuestion:\n${question}\n\nSummaries:\n${summaries.map((summary, index) => `Chunk ${index + 1}:\n${summary}`).join('\n\n')}` },
  ];
}
