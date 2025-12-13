import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LLMService } from '../../../../src/lib/llm/llm-service.js';
import { AnthropicClient, CompletionResponse } from '../../../../src/lib/llm/anthropic-client.js';
import { IdeationContent, SpecificationContent } from '../../../../src/types/index.js';

// Create mock AnthropicClient
const createMockClient = () => {
  return {
    chat: vi.fn(),
    complete: vi.fn(),
    stream: vi.fn(),
    streamChat: vi.fn(),
    calculateCost: vi.fn().mockReturnValue(0.01),
    getModel: vi.fn().mockReturnValue('claude-sonnet-4-20250514'),
  } as unknown as AnthropicClient;
};

// Helper to create mock response
const createMockResponse = (
  content: string,
  inputTokens: number = 100,
  outputTokens: number = 50
): CompletionResponse => ({
  content,
  model: 'claude-sonnet-4-20250514',
  stopReason: 'end_turn',
  inputTokens,
  outputTokens,
});

const sampleIdeation: IdeationContent = {
  problem_statement: 'Task management is difficult',
  target_users: 'Software developers',
  use_cases: ['Create tasks', 'Track progress', 'Set deadlines'],
  success_criteria: ['80% completion rate'],
  constraints: {
    must_have: [],
    nice_to_have: [],
    out_of_scope: [],
  },
};

const sampleSpecification: SpecificationContent = {
  architecture: 'Three-tier with React frontend',
  tech_stack: [
    { layer: 'Frontend', choice: 'React', rationale: 'Popular framework' },
    { layer: 'Backend', choice: 'Node.js', rationale: 'JavaScript everywhere' },
  ],
  data_models: 'Task entity with id, title, status',
  api_contracts: 'REST API',
  ui_requirements: '',
  raw_content: '',
};

describe('LLMService', () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let service: LLMService;

  beforeEach(() => {
    mockClient = createMockClient();
    service = new LLMService({ client: mockClient as unknown as AnthropicClient });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create service with provided client', () => {
      const service = new LLMService({ client: mockClient as unknown as AnthropicClient });
      expect(service.getClient()).toBe(mockClient);
    });
  });

  describe('createPhaseConversation', () => {
    it('should create conversation with ideation system prompt', () => {
      const conv = service.createPhaseConversation('ideation');
      expect(conv.getSystemPrompt()).toContain('product strategist');
    });

    it('should create conversation with specification system prompt', () => {
      const conv = service.createPhaseConversation('specification');
      expect(conv.getSystemPrompt()).toContain('software architect');
    });

    it('should create conversation with planning system prompt', () => {
      const conv = service.createPhaseConversation('planning');
      expect(conv.getSystemPrompt()).toContain('project manager');
    });
  });

  describe('Ideation Phase', () => {
    describe('startIdeation', () => {
      it('should start ideation conversation', async () => {
        vi.mocked(mockClient.chat).mockResolvedValue(
          createMockResponse('<understanding>Great idea</understanding>')
        );

        const { response, conversation } = await service.startIdeation(
          'TaskApp',
          'A task management app'
        );

        expect(response).toContain('Great idea');
        expect(conversation).toBeDefined();
        expect(mockClient.chat).toHaveBeenCalled();
      });
    });

    describe('continueIdeation', () => {
      it('should continue with user input', async () => {
        vi.mocked(mockClient.chat).mockResolvedValue(
          createMockResponse('Got it, focusing on mobile')
        );

        const conv = service.createPhaseConversation('ideation');
        // Add initial messages
        conv.addMessage('user', 'Initial');
        conv.addMessage('assistant', 'Response');

        const response = await service.continueIdeation(
          conv,
          'Focus on mobile users',
          { problem_statement: 'Tasks are hard' }
        );

        expect(response).toContain('mobile');
      });
    });

    describe('completeIdeation', () => {
      it('should complete and parse ideation', async () => {
        const fullResponse = `
<problem_statement>Tasks are difficult to manage</problem_statement>
<target_users>Software developers</target_users>
<use_cases>
- Create tasks
- Track progress
- Set deadlines
</use_cases>
<success_criteria>
- 80% completion rate
</success_criteria>
<must_have>
- Task creation
</must_have>
<nice_to_have>
- Collaboration
</nice_to_have>
<out_of_scope>
- Video calls
</out_of_scope>
`;
        vi.mocked(mockClient.chat).mockResolvedValue(
          createMockResponse(fullResponse, 500, 300)
        );

        const conv = service.createPhaseConversation('ideation');
        conv.addMessage('user', 'Initial idea');
        conv.addMessage('assistant', 'Lets discuss');

        const result = await service.completeIdeation(conv);

        expect(result.content.problem_statement).toBe('Tasks are difficult to manage');
        expect(result.content.use_cases).toHaveLength(3);
        expect(result.tokensUsed).toBe(800);
      });

      it('should throw if content incomplete', async () => {
        vi.mocked(mockClient.chat).mockResolvedValue(
          createMockResponse('<problem_statement>Only this</problem_statement>')
        );

        const conv = service.createPhaseConversation('ideation');
        conv.addMessage('user', 'Initial');
        conv.addMessage('assistant', 'Response');

        await expect(service.completeIdeation(conv)).rejects.toThrow('incomplete');
      });
    });
  });

  describe('Specification Phase', () => {
    describe('startSpecification', () => {
      it('should start specification conversation', async () => {
        vi.mocked(mockClient.chat).mockResolvedValue(
          createMockResponse('<architecture_overview>Microservices</architecture_overview>')
        );

        const { response, conversation } = await service.startSpecification(
          'TaskApp',
          sampleIdeation
        );

        expect(response).toContain('Microservices');
        expect(conversation).toBeDefined();
      });
    });

    describe('completeSpecification', () => {
      it('should complete and parse specification', async () => {
        const fullResponse = `
<architecture>Three-tier architecture with React frontend</architecture>
<tech_stack>
- Frontend: React
- Backend: Node.js
</tech_stack>
<data_models>Task entity with id, title</data_models>
<api_contracts>REST API</api_contracts>
`;
        vi.mocked(mockClient.chat).mockResolvedValue(
          createMockResponse(fullResponse, 400, 200)
        );

        const conv = service.createPhaseConversation('specification');
        conv.addMessage('user', 'Start');
        conv.addMessage('assistant', 'Lets design');

        const result = await service.completeSpecification(conv, sampleIdeation);

        expect(result.content.architecture).toContain('Three-tier');
        expect(result.content.tech_stack).toHaveLength(2);
      });
    });
  });

  describe('Planning Phase', () => {
    describe('startPlanning', () => {
      it('should start planning conversation', async () => {
        vi.mocked(mockClient.chat).mockResolvedValue(
          createMockResponse('<proposed_phases>Phase 1: Setup</proposed_phases>')
        );

        const { response, conversation } = await service.startPlanning(
          'TaskApp',
          sampleIdeation,
          sampleSpecification
        );

        expect(response).toContain('Setup');
        expect(conversation).toBeDefined();
      });
    });

    describe('completePlanning', () => {
      it('should complete and parse planning', async () => {
        const fullResponse = `
<phase name="Foundation" number="1">
<description>Setup project</description>
<task id="1.1">
<description>Initialize repo</description>
<acceptance_criteria>
- Repo created
</acceptance_criteria>
<depends_on></depends_on>
</task>
</phase>
`;
        vi.mocked(mockClient.chat).mockResolvedValue(
          createMockResponse(fullResponse, 300, 150)
        );

        const conv = service.createPhaseConversation('planning');
        conv.addMessage('user', 'Start');
        conv.addMessage('assistant', 'Lets plan');

        const result = await service.completePlanning(conv, sampleSpecification);

        expect(result.content).toHaveLength(1);
        expect(result.content[0]?.name).toBe('Foundation');
        expect(result.content[0]?.tasks).toHaveLength(1);
      });
    });
  });

  describe('Validation', () => {
    describe('validateIdeation', () => {
      it('should validate ideation content', async () => {
        vi.mocked(mockClient.chat).mockResolvedValue(
          createMockResponse(`
<is_valid>true</is_valid>
<issues></issues>
<suggestions>- Add more use cases</suggestions>
<score>85</score>
`)
        );

        const result = await service.validateIdeation(sampleIdeation);

        expect(result.isValid).toBe(true);
        expect(result.score).toBe(85);
      });
    });

    describe('validateSpecification', () => {
      it('should validate specification content', async () => {
        vi.mocked(mockClient.chat).mockResolvedValue(
          createMockResponse(`
<is_valid>true</is_valid>
<issues></issues>
<suggestions></suggestions>
<score>90</score>
`)
        );

        const result = await service.validateSpecification(sampleSpecification);

        expect(result.isValid).toBe(true);
        expect(result.score).toBe(90);
      });
    });

    describe('validatePlanning', () => {
      it('should validate planning content', async () => {
        vi.mocked(mockClient.chat).mockResolvedValue(
          createMockResponse(`
<is_valid>false</is_valid>
<issues>
- Phase 2 depends on incomplete phase
</issues>
<suggestions>
- Reorder phases
</suggestions>
<score>60</score>
`)
        );

        const result = await service.validatePlanning([
          {
            phase_number: 1,
            name: 'Setup',
            description: '',
            status: 'pending',
            tasks: [],
          },
        ]);

        expect(result.isValid).toBe(false);
        expect(result.issues).toHaveLength(1);
        expect(result.score).toBe(60);
      });
    });
  });

  describe('Single-shot methods', () => {
    describe('complete', () => {
      it('should get single completion', async () => {
        vi.mocked(mockClient.complete).mockResolvedValue(
          createMockResponse('Answer to your question')
        );

        const result = await service.complete('What is 2+2?');

        expect(result).toBe('Answer to your question');
        expect(mockClient.complete).toHaveBeenCalledWith(
          'What is 2+2?',
          undefined
        );
      });

      it('should pass options', async () => {
        vi.mocked(mockClient.complete).mockResolvedValue(createMockResponse('OK'));

        await service.complete('Test', { temperature: 0.5 });

        expect(mockClient.complete).toHaveBeenCalledWith('Test', { temperature: 0.5 });
      });
    });

    describe('stream', () => {
      it('should yield text chunks', async () => {
        async function* mockStream() {
          yield { type: 'content_block_delta' as const, text: 'Hello' };
          yield { type: 'content_block_delta' as const, text: ' World' };
          yield { type: 'message_stop' as const };
        }

        vi.mocked(mockClient.stream).mockReturnValue(mockStream() as any);

        const chunks: string[] = [];
        for await (const chunk of service.stream('Say hello')) {
          chunks.push(chunk);
        }

        expect(chunks).toEqual(['Hello', ' World']);
      });
    });
  });
});
