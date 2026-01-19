'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Mic, MicOff, Square, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';

// Web Speech API types
interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
  onstart: () => void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

type VoiceInputStatus = 'idle' | 'listening' | 'processing' | 'error';

interface VoiceInputProps {
  onTranscript: (text: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
  language?: string;
  className?: string;
}

export function VoiceInput({
  onTranscript,
  onError,
  disabled = false,
  language = 'nl-NL',
  className,
}: VoiceInputProps) {
  const [status, setStatus] = useState<VoiceInputStatus>('idle');
  const [isSupported, setIsSupported] = useState(true);
  const [interimTranscript, setInterimTranscript] = useState('');
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Check for browser support
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onstart = () => {
      setStatus('listening');
      haptics.success();
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimText = '';
      let finalText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interimText += transcript;
        }
      }

      if (interimText) {
        setInterimTranscript(interimText);
        onTranscript(interimText, false);
      }

      if (finalText) {
        setInterimTranscript('');
        onTranscript(finalText, true);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      setStatus('error');
      haptics.error();

      const errorMessages: Record<string, string> = {
        'not-allowed': 'Microfoontoegang geweigerd',
        'no-speech': 'Geen spraak gedetecteerd',
        'audio-capture': 'Geen microfoon gevonden',
        'network': 'Netwerkfout',
        'aborted': 'Opname geannuleerd',
      };

      const message = errorMessages[event.error] || `Fout: ${event.error}`;
      onError?.(message);

      // Reset after error
      setTimeout(() => setStatus('idle'), 2000);
    };

    recognition.onend = () => {
      if (status === 'listening') {
        setStatus('idle');
      }
      setInterimTranscript('');
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.abort();
    };
  }, [language, onTranscript, onError, status]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current || disabled) return;

    haptics.medium();
    try {
      recognitionRef.current.start();
    } catch (err) {
      // Recognition might already be running
      console.error('Failed to start recognition:', err);
    }
  }, [disabled]);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return;

    haptics.light();
    recognitionRef.current.stop();
    setStatus('processing');

    // Short delay before returning to idle
    setTimeout(() => setStatus('idle'), 500);
  }, []);

  const toggleListening = useCallback(() => {
    if (status === 'listening') {
      stopListening();
    } else if (status === 'idle') {
      startListening();
    }
  }, [status, startListening, stopListening]);

  if (!isSupported) {
    return null;
  }

  return (
    <div className={cn('relative', className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={toggleListening}
        disabled={disabled || status === 'processing'}
        className={cn(
          'relative transition-colors',
          status === 'listening' && 'bg-destructive/10 text-destructive hover:bg-destructive/20',
          status === 'error' && 'text-destructive'
        )}
        title={status === 'listening' ? 'Stop opnemen' : 'Spraakinvoer'}
      >
        {status === 'processing' ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : status === 'listening' ? (
          <Square className="h-4 w-4" />
        ) : (
          <Mic className="h-5 w-5" />
        )}

        {/* Pulse animation when listening */}
        {status === 'listening' && (
          <span className="absolute inset-0 rounded-md animate-ping bg-destructive/20" />
        )}
      </Button>

      {/* Interim transcript preview */}
      {interimTranscript && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-muted rounded-lg text-sm text-muted-foreground whitespace-nowrap max-w-[200px] truncate">
          {interimTranscript}
        </div>
      )}
    </div>
  );
}

/**
 * Voice Input Button with Modal
 * Shows a fullscreen recording overlay on mobile
 */
interface VoiceInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTranscript: (text: string) => void;
  language?: string;
}

export function VoiceInputModal({
  isOpen,
  onClose,
  onTranscript,
  language = 'nl-NL',
}: VoiceInputModalProps) {
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setTranscript('');
      setIsListening(false);
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      onClose();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onstart = () => {
      setIsListening(true);
      haptics.success();
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let text = '';
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }
      setTranscript(text);
    };

    recognition.onerror = () => {
      haptics.error();
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();

    return () => {
      recognition.abort();
    };
  }, [isOpen, language, onClose]);

  const handleConfirm = () => {
    if (transcript.trim()) {
      onTranscript(transcript.trim());
    }
    recognitionRef.current?.stop();
    onClose();
  };

  const handleCancel = () => {
    recognitionRef.current?.abort();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[rgb(var(--background))] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <Button variant="ghost" onClick={handleCancel}>
          Annuleren
        </Button>
        <h2 className="font-semibold">Spraakinvoer</h2>
        <Button
          variant="ghost"
          onClick={handleConfirm}
          disabled={!transcript.trim()}
          className="text-zentoria-500"
        >
          Klaar
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        {/* Microphone indicator */}
        <div
          className={cn(
            'w-24 h-24 rounded-full flex items-center justify-center mb-8',
            'transition-all duration-300',
            isListening
              ? 'bg-destructive/20 animate-pulse'
              : 'bg-muted'
          )}
        >
          {isListening ? (
            <Mic className="h-12 w-12 text-destructive" />
          ) : (
            <MicOff className="h-12 w-12 text-muted-foreground" />
          )}
        </div>

        {/* Status text */}
        <p className="text-lg text-muted-foreground mb-4">
          {isListening ? 'Luisteren...' : 'Niet actief'}
        </p>

        {/* Transcript preview */}
        <div className="w-full max-w-md p-4 bg-muted/50 rounded-xl min-h-[100px]">
          <p className="text-center">
            {transcript || (
              <span className="text-muted-foreground">
                Begin met spreken...
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Bottom controls */}
      <div className="p-6 pb-safe border-t">
        <Button
          onClick={() => {
            if (isListening) {
              recognitionRef.current?.stop();
            } else {
              recognitionRef.current?.start();
            }
          }}
          className={cn(
            'w-full h-14 text-lg',
            isListening
              ? 'bg-destructive hover:bg-destructive/90'
              : 'bg-zentoria-500 hover:bg-zentoria-600'
          )}
        >
          {isListening ? 'Stop opname' : 'Start opname'}
        </Button>
      </div>
    </div>
  );
}

/**
 * Check if Web Speech API is supported
 */
export function isSpeechRecognitionSupported(): boolean {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}
