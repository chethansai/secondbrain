import React from 'react';
import { Pressable, Text, View } from 'react-native';

interface OcrErrorBoundaryProps {
  children: React.ReactNode;
  onReset: () => void;
}

interface OcrErrorBoundaryState {
  errorMessage: string | null;
}

export class OcrErrorBoundary extends React.Component<
  OcrErrorBoundaryProps,
  OcrErrorBoundaryState
> {
  state: OcrErrorBoundaryState = {
    errorMessage: null,
  };

  static getDerivedStateFromError(error: unknown): OcrErrorBoundaryState {
    return {
      errorMessage:
        error instanceof Error ? error.message : 'OCR screen crashed.',
    };
  }

  componentDidCatch(error: unknown) {
    console.error('OCR render crash', error);
  }

  render() {
    if (this.state.errorMessage) {
      return (
        <View style={{ flex: 1, padding: 24, justifyContent: 'center' }}>
          <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 12 }}>
            OCR Error
          </Text>

          <Text style={{ marginBottom: 20 }}>
            {this.state.errorMessage}
          </Text>

          <Pressable
            onPress={() => {
              this.setState({ errorMessage: null });
              this.props.onReset();
            }}
            style={{
              padding: 14,
              borderRadius: 8,
              backgroundColor: '#5645d4',
            }}
          >
            <Text style={{ color: 'white', textAlign: 'center' }}>
              Restart OCR
            </Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}
