import { AssistantRequest, AssistantResponse } from './assistantTypes';

const TAILNET_ENDPOINT = 'https://vmi3321442.tailb6229f.ts.net/v1/responses';

export async function getAssistantResponse(req: AssistantRequest): Promise<AssistantResponse> {
  const body = {
    prompt: req.query,
    context: req.context || 'notes',
  };

  const resp = await fetch(TAILNET_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    throw new Error(`Assistant service error: ${resp.status}`);
  }

  const json = await resp.json();
  // Normalize to AssistantResponse; vary per backend
  const text = json?.result || json?.text || JSON.stringify(json);
  return { text } as AssistantResponse;
}

export default { getAssistantResponse };
