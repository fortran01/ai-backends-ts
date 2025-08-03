import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { MemoryService } from './memory.service';

/**
 * Unit tests for MemoryService
 * 
 * Following the coding guidelines: Comprehensive testing with Jest,
 * proper mocking, and both success and failure scenarios
 */
describe('MemoryService', () => {
  let service: MemoryService;
  let loggerSpy: jest.SpyInstance;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MemoryService],
    }).compile();

    service = module.get<MemoryService>(MemoryService);
    
    // Mock logger to avoid console output during tests
    loggerSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('getSessionMessages', () => {
    it('should create new session with system message for new session ID', () => {
      const sessionId: string = 'test-session-1';
      
      const messages = service.getSessionMessages(sessionId);
      
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({
        role: 'system',
        content: 'You are a helpful AI assistant. Use the conversation history to maintain context and provide relevant responses.'
      });
      expect(loggerSpy).toHaveBeenCalledWith(`Created new conversation memory for session: ${sessionId}`);
    });

    it('should return existing messages for existing session ID', () => {
      const sessionId: string = 'test-session-2';
      
      // First call creates the session
      const messages1 = service.getSessionMessages(sessionId);
      messages1.push({ role: 'user', content: 'Hello' });
      
      // Second call should return the same session with added message
      const messages2 = service.getSessionMessages(sessionId);
      
      expect(messages2).toHaveLength(2);
      expect(messages2[1]).toEqual({ role: 'user', content: 'Hello' });
      expect(loggerSpy).toHaveBeenCalledTimes(1); // Only logged once for creation
    });

    it('should handle multiple different sessions independently', () => {
      const sessionId1: string = 'session-1';
      const sessionId2: string = 'session-2';
      
      const messages1 = service.getSessionMessages(sessionId1);
      const messages2 = service.getSessionMessages(sessionId2);
      
      messages1.push({ role: 'user', content: 'Message for session 1' });
      messages2.push({ role: 'user', content: 'Message for session 2' });
      
      expect(service.getSessionMessages(sessionId1)).toHaveLength(2);
      expect(service.getSessionMessages(sessionId2)).toHaveLength(2);
      expect(service.getSessionMessages(sessionId1)[1].content).toBe('Message for session 1');
      expect(service.getSessionMessages(sessionId2)[1].content).toBe('Message for session 2');
    });
  });

  describe('buildConversationHistory', () => {
    it('should build conversation history with new user input', () => {
      const sessionId: string = 'test-session-3';
      const input: string = 'What is machine learning?';
      
      const history = service.buildConversationHistory(sessionId, input);
      
      expect(history).toHaveLength(2);
      expect(history[0].role).toBe('system');
      expect(history[1]).toEqual({
        role: 'user',
        content: input
      });
    });

    it('should include existing conversation history with new input', () => {
      const sessionId: string = 'test-session-4';
      
      // Add some existing conversation history
      const existingMessages = service.getSessionMessages(sessionId);
      existingMessages.push({ role: 'user', content: 'Previous question' });
      existingMessages.push({ role: 'assistant', content: 'Previous answer' });
      
      const newInput: string = 'Follow-up question';
      const history = service.buildConversationHistory(sessionId, newInput);
      
      expect(history).toHaveLength(4);
      expect(history[0].role).toBe('system');
      expect(history[1].content).toBe('Previous question');
      expect(history[2].content).toBe('Previous answer');
      expect(history[3]).toEqual({
        role: 'user',
        content: newInput
      });
    });

    it('should handle errors gracefully and return fallback history', () => {
      const sessionId: string = 'test-session-5';
      const input: string = 'Test input';
      
      // Mock an error in getSessionMessages
      jest.spyOn(service, 'getSessionMessages').mockImplementationOnce(() => {
        throw new Error('Mock error');
      });
      
      const history = service.buildConversationHistory(sessionId, input);
      
      expect(history).toHaveLength(2);
      expect(history[0].role).toBe('system');
      expect(history[1]).toEqual({
        role: 'user',
        content: input
      });
    });
  });

  describe('formatChatTemplate', () => {
    it('should format single system message correctly', () => {
      const messages = [
        { role: 'system' as const, content: 'You are a helpful assistant.' }
      ];
      
      const formatted = service.formatChatTemplate(messages);
      
      expect(formatted).toBe('<|system|>\nYou are a helpful assistant.</s>\n<|assistant|>\n');
    });

    it('should format complete conversation correctly', () => {
      const messages = [
        { role: 'system' as const, content: 'You are helpful.' },
        { role: 'user' as const, content: 'Hello!' },
        { role: 'assistant' as const, content: 'Hi there!' },
        { role: 'user' as const, content: 'How are you?' }
      ];
      
      const formatted = service.formatChatTemplate(messages);
      
      const expected = '<|system|>\nYou are helpful.</s>\n' +
                      '<|user|>\nHello!</s>\n' +
                      '<|assistant|>\nHi there!</s>\n' +
                      '<|user|>\nHow are you?</s>\n' +
                      '<|assistant|>\n';
      
      expect(formatted).toBe(expected);
    });

    it('should handle empty messages array', () => {
      const messages: any[] = [];
      
      const formatted = service.formatChatTemplate(messages);
      
      expect(formatted).toBe('<|assistant|>\n');
    });

    it('should handle unknown roles gracefully', () => {
      const messages = [
        { role: 'unknown' as any, content: 'Test content' }
      ];
      
      const formatted = service.formatChatTemplate(messages);
      
      expect(formatted).toBe('<|assistant|>\n');
    });
  });

  describe('saveConversation', () => {
    it('should save user input and assistant output to session memory', () => {
      const sessionId: string = 'test-session-6';
      const input: string = 'What is AI?';
      const output: string = 'AI is artificial intelligence...';
      
      service.saveConversation(sessionId, input, output);
      
      const messages = service.getSessionMessages(sessionId);
      expect(messages).toHaveLength(3); // system + user + assistant
      expect(messages[1]).toEqual({ role: 'user', content: input });
      expect(messages[2]).toEqual({ role: 'assistant', content: output });
    });

    it('should not duplicate user message if already present', () => {
      const sessionId: string = 'test-session-7';
      const input: string = 'Test question';
      const output: string = 'Test answer';
      
      // Manually add user message first
      const messages = service.getSessionMessages(sessionId);
      messages.push({ role: 'user', content: input });
      
      service.saveConversation(sessionId, input, output);
      
      const finalMessages = service.getSessionMessages(sessionId);
      expect(finalMessages).toHaveLength(3); // system + user + assistant (no duplicate user)
      expect(finalMessages[1]).toEqual({ role: 'user', content: input });
      expect(finalMessages[2]).toEqual({ role: 'assistant', content: output });
    });

    it('should handle errors gracefully during conversation saving', () => {
      const sessionId: string = 'test-session-8';
      const input: string = 'Test input';
      const output: string = 'Test output';
      
      // Mock an error in getSessionMessages
      jest.spyOn(service, 'getSessionMessages').mockImplementationOnce(() => {
        throw new Error('Mock error');
      });
      
      expect(() => {
        service.saveConversation(sessionId, input, output);
      }).not.toThrow();
    });

    it('should truncate long output in log message', () => {
      const sessionId: string = 'test-session-9';
      const input: string = 'Short input';
      const longOutput: string = 'A'.repeat(200); // 200 character string
      
      service.saveConversation(sessionId, input, longOutput);
      
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Saved conversation to memory for session: ${sessionId}`)
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('A'.repeat(100) + '...')
      );
    });
  });

  describe('getConversationStats', () => {
    it('should return correct stats for session with messages', () => {
      const sessionId: string = 'test-session-10';
      
      // Add some messages
      service.saveConversation(sessionId, 'Hello', 'Hi there!');
      service.saveConversation(sessionId, 'How are you?', 'I am doing well, thank you!');
      
      const stats = service.getConversationStats(sessionId);
      
      expect(stats.message_count).toBe(5); // system + 2 user + 2 assistant
      expect(stats.memory_size).toBeGreaterThan(0);
      expect(stats.context_length).toBeGreaterThan(0);
      expect(typeof stats.memory_size).toBe('number');
      expect(typeof stats.context_length).toBe('number');
    });

    it('should return stats for new session with only system message', () => {
      const sessionId: string = 'test-session-11';
      
      const stats = service.getConversationStats(sessionId);
      
      expect(stats.message_count).toBe(1); // Only system message
      expect(stats.memory_size).toBeGreaterThan(0);
      expect(stats.context_length).toBeGreaterThan(0);
    });

    it('should handle errors gracefully and return zero stats', () => {
      const sessionId: string = 'test-session-12';
      
      // Mock an error in getSessionMessages
      jest.spyOn(service, 'getSessionMessages').mockImplementationOnce(() => {
        throw new Error('Mock error');
      });
      
      const stats = service.getConversationStats(sessionId);
      
      expect(stats).toEqual({
        message_count: 0,
        memory_size: 0,
        context_length: 0
      });
    });
  });

  describe('clearSession', () => {
    it('should clear existing session memory', () => {
      const sessionId: string = 'test-session-13';
      
      // Create session and add messages
      service.saveConversation(sessionId, 'Hello', 'Hi');
      expect(service.getSessionMessages(sessionId)).toHaveLength(3);
      
      service.clearSession(sessionId);
      
      // Should create new session when accessed again
      expect(service.getSessionMessages(sessionId)).toHaveLength(1);
      expect(loggerSpy).toHaveBeenCalledWith(`Cleared memory for session: ${sessionId}`);
    });

    it('should handle clearing non-existent session gracefully', () => {
      const sessionId: string = 'non-existent-session';
      
      expect(() => {
        service.clearSession(sessionId);
      }).not.toThrow();
      
      expect(loggerSpy).not.toHaveBeenCalledWith(expect.stringContaining('Cleared memory'));
    });
  });

  describe('getActiveSessions', () => {
    it('should return list of active session IDs', () => {
      const sessionIds: string[] = ['session-1', 'session-2', 'session-3'];
      
      // Create sessions
      sessionIds.forEach(id => service.getSessionMessages(id));
      
      const activeSessions = service.getActiveSessions();
      
      expect(activeSessions).toHaveLength(3);
      expect(activeSessions).toEqual(expect.arrayContaining(sessionIds));
    });

    it('should return empty array when no sessions exist', () => {
      const activeSessions = service.getActiveSessions();
      
      expect(activeSessions).toEqual([]);
    });

    it('should not include cleared sessions', () => {
      const sessionId: string = 'temp-session';
      
      service.getSessionMessages(sessionId);
      expect(service.getActiveSessions()).toContain(sessionId);
      
      service.clearSession(sessionId);
      expect(service.getActiveSessions()).not.toContain(sessionId);
    });
  });

  describe('cleanupOldSessions', () => {
    it('should remove excess sessions when over limit', () => {
      const sessionIds: string[] = ['s1', 's2', 's3', 's4', 's5'];
      
      // Create 5 sessions
      sessionIds.forEach(id => service.getSessionMessages(id));
      expect(service.getActiveSessions()).toHaveLength(5);
      
      // Cleanup with max 3 sessions
      service.cleanupOldSessions(3);
      
      expect(service.getActiveSessions()).toHaveLength(3);
      expect(loggerSpy).toHaveBeenCalledWith('Cleaned up 2 old sessions');
    });

    it('should not remove sessions when under limit', () => {
      const sessionIds: string[] = ['s1', 's2'];
      
      // Create 2 sessions
      sessionIds.forEach(id => service.getSessionMessages(id));
      expect(service.getActiveSessions()).toHaveLength(2);
      
      // Cleanup with max 5 sessions
      service.cleanupOldSessions(5);
      
      expect(service.getActiveSessions()).toHaveLength(2);
      expect(loggerSpy).not.toHaveBeenCalledWith(expect.stringContaining('Cleaned up'));
    });

    it('should use default limit of 100 when not specified', () => {
      // Create 50 sessions (under default limit)
      for (let i = 0; i < 50; i++) {
        service.getSessionMessages(`session-${i}`);
      }
      
      service.cleanupOldSessions();
      
      expect(service.getActiveSessions()).toHaveLength(50);
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete conversation flow', () => {
      const sessionId: string = 'integration-test';
      const conversations = [
        { user: 'Hello!', assistant: 'Hi there! How can I help you?' },
        { user: 'What is TypeScript?', assistant: 'TypeScript is a superset of JavaScript...' },
        { user: 'Can you give an example?', assistant: 'Sure! Here\'s a simple example...' }
      ];
      
      conversations.forEach(conv => {
        const history = service.buildConversationHistory(sessionId, conv.user);
        const formatted = service.formatChatTemplate(history);
        service.saveConversation(sessionId, conv.user, conv.assistant);
        
        expect(history).toContain(expect.objectContaining({ role: 'user', content: conv.user }));
        expect(formatted).toContain(conv.user);
      });
      
      const finalStats = service.getConversationStats(sessionId);
      expect(finalStats.message_count).toBe(7); // system + 3 user + 3 assistant
      
      const finalMessages = service.getSessionMessages(sessionId);
      expect(finalMessages[finalMessages.length - 1].content).toBe(conversations[2].assistant);
    });

    it('should maintain session isolation across concurrent operations', () => {
      const session1: string = 'concurrent-1';
      const session2: string = 'concurrent-2';
      
      // Simulate concurrent operations
      service.saveConversation(session1, 'Question 1A', 'Answer 1A');
      service.saveConversation(session2, 'Question 2A', 'Answer 2A');
      service.saveConversation(session1, 'Question 1B', 'Answer 1B');
      service.saveConversation(session2, 'Question 2B', 'Answer 2B');
      
      const messages1 = service.getSessionMessages(session1);
      const messages2 = service.getSessionMessages(session2);
      
      expect(messages1).toHaveLength(5); // system + 2 user + 2 assistant
      expect(messages2).toHaveLength(5); // system + 2 user + 2 assistant
      
      expect(messages1[1].content).toBe('Question 1A');
      expect(messages1[3].content).toBe('Question 1B');
      expect(messages2[1].content).toBe('Question 2A');
      expect(messages2[3].content).toBe('Question 2B');
    });
  });
});