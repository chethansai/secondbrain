export type AssistantResponse = {
  text: string;
  metadata?: Record<string, any>;
};

export type AssistantRequest = {
  query: string;
  context?: string;
};
