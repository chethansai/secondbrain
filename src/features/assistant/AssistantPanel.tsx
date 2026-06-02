import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet } from 'react-native';
import { getAssistantResponse } from './assistantService';

export const AssistantPanel: React.FC = () => {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const send = async () => {
    try {
      setLoading(true);
      const res = await getAssistantResponse({ query });
      setResponse(res.text);
    } catch (err: any) {
      setResponse(err?.message ?? 'Error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Assistant</Text>
      <TextInput
        style={styles.input}
        placeholder="Ask the assistant..."
        value={query}
        onChangeText={setQuery}
        editable={!loading}
      />
      <Button title={loading ? 'Thinking...' : 'Send'} onPress={send} disabled={loading || query.trim() === ''} />
      {response ? <Text style={styles.response}>{response}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { padding: 16 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#ddd', padding: 8, marginBottom: 8, borderRadius: 6 },
  response: { marginTop: 12 },
});

export default AssistantPanel;
