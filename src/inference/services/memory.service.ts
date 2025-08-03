import { Injectable, Logger } from '@nestjs/common';

/**
 * Interface for chat messages following TinyLlama chat template format
 */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Service for managing stateful conversation memory with structured message history
 * 
 * Following the coding guidelines: Uses proper TypeScript typing and
 * comprehensive error handling for memory management
 */
@Injectable()
export class MemoryService {
  private readonly logger: Logger = new Logger(MemoryService.name);
  private readonly sessionMemories: Map<string, ChatMessage[]> = new Map();

  /**
   * System message template for TinyLlama
   */
  private readonly systemMessage: ChatMessage = {
    role: 'system',
    content: 'You are a helpful AI assistant. Use the conversation history to maintain context and provide relevant responses.'
  };

  /**
   * Get or create message history for a specific session
   */
  public getSessionMessages(sessionId: string): ChatMessage[] {
    if (!this.sessionMemories.has(sessionId)) {
      const messages: ChatMessage[] = [this.systemMessage];
      this.sessionMemories.set(sessionId, messages);
      this.logger.log(`Created new conversation memory for session: ${sessionId}`);
    }
    return this.sessionMemories.get(sessionId)!;
  }

  /**
   * Build conversation history with current user input for TinyLlama chat template
   */
  public buildConversationHistory(sessionId: string, input: string): ChatMessage[] {
    try {
      const messages: ChatMessage[] = this.getSessionMessages(sessionId);
      
      // Add current user message
      const userMessage: ChatMessage = {
        role: 'user',
        content: input
      };
      
      const conversationHistory: ChatMessage[] = [...messages, userMessage];
      
      // Debug logging to see conversation structure
      this.logger.log(`Session ${sessionId} conversation history:`, JSON.stringify(conversationHistory, null, 2));
      
      return conversationHistory;
    } catch (error: unknown) {
      this.logger.error(`Error building conversation history for session ${sessionId}:`, error);
      return [
        this.systemMessage,
        { role: 'user', content: input }
      ];
    }
  }

  /**
   * Format chat template for TinyLlama (simulating tokenizer.apply_chat_template)
   */
  public formatChatTemplate(messages: ChatMessage[]): string {
    let formattedPrompt: string = '';
    
    for (const message of messages) {
      switch (message.role) {
        case 'system':
          formattedPrompt += `<|system|>\n${message.content}</s>\n`;
          break;
        case 'user':
          formattedPrompt += `<|user|>\n${message.content}</s>\n`;
          break;
        case 'assistant':
          formattedPrompt += `<|assistant|>\n${message.content}</s>\n`;
          break;
      }
    }
    
    // Add generation prompt for assistant response
    formattedPrompt += '<|assistant|>\n';
    
    this.logger.log('Formatted chat template:\n' + formattedPrompt);
    return formattedPrompt;
  }

  /**
   * Save conversation turn to message history
   */
  public saveConversation(sessionId: string, input: string, output: string): void {
    try {
      const messages: ChatMessage[] = this.getSessionMessages(sessionId);
      
      // Add user message if not already present (in case of direct saving)
      const lastMessage: ChatMessage | undefined = messages[messages.length - 1];
      if (!lastMessage || lastMessage.role !== 'user' || lastMessage.content !== input) {
        messages.push({
          role: 'user',
          content: input
        });
      }
      
      // Add assistant response
      messages.push({
        role: 'assistant',
        content: output
      });
      
      this.logger.log(`Saved conversation to memory for session: ${sessionId}. Input: "${input}", Output: "${output.substring(0, 100)}..."`);
    } catch (error: unknown) {
      this.logger.error(`Error saving conversation for session ${sessionId}:`, error);
    }
  }

  /**
   * Get conversation statistics for a session
   */
  public getConversationStats(sessionId: string): {
    message_count: number;
    memory_size: number;
    context_length: number;
  } {
    try {
      const messages: ChatMessage[] = this.getSessionMessages(sessionId);
      const serializedMessages: string = JSON.stringify(messages);
      const totalContent: string = messages.map(m => m.content).join(' ');

      return {
        message_count: messages.length,
        memory_size: serializedMessages.length,
        context_length: totalContent.length
      };
    } catch (error: unknown) {
      this.logger.error(`Error getting conversation stats for session ${sessionId}:`, error);
      return {
        message_count: 0,
        memory_size: 0,
        context_length: 0
      };
    }
  }

  /**
   * Clear memory for a specific session
   */
  public clearSession(sessionId: string): void {
    if (this.sessionMemories.has(sessionId)) {
      this.sessionMemories.delete(sessionId);
      this.logger.log(`Cleared memory for session: ${sessionId}`);
    }
  }

  /**
   * Get all active session IDs
   */
  public getActiveSessions(): string[] {
    return Array.from(this.sessionMemories.keys());
  }

  /**
   * Clean up old sessions (simple implementation for demo)
   */
  public cleanupOldSessions(maxSessions: number = 100): void {
    const sessions: string[] = this.getActiveSessions();
    if (sessions.length > maxSessions) {
      const sessionsToRemove: number = sessions.length - maxSessions;
      for (let i = 0; i < sessionsToRemove; i++) {
        this.clearSession(sessions[i]);
      }
      this.logger.log(`Cleaned up ${sessionsToRemove} old sessions`);
    }
  }

}