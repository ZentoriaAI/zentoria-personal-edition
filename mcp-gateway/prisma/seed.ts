import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const defaultAgents = [
  {
    name: 'chat',
    displayName: 'Chat Agent',
    description: 'General purpose conversational AI for everyday tasks',
    model: 'llama3.2:3b',
    temperature: 0.7,
    capabilities: ['chat', 'general'],
    tools: [],
    isActive: true,
    isDefault: true,
    sortOrder: 0,
  },
  {
    name: 'code',
    displayName: 'Code Agent',
    description: 'Specialized in code generation, debugging, and programming assistance',
    systemPrompt: `You are an expert programmer with deep knowledge of multiple programming languages and frameworks.
You write clean, efficient, well-documented code. When helping with code:
- Always explain your approach before writing code
- Include relevant comments in the code
- Consider edge cases and error handling
- Suggest improvements and best practices`,
    model: 'codellama:7b',
    temperature: 0.3,
    capabilities: ['chat', 'code', 'debug'],
    tools: [],
    isActive: true,
    isDefault: false,
    sortOrder: 1,
  },
  {
    name: 'file',
    displayName: 'File Agent',
    description: 'Helps analyze, summarize, and work with uploaded files',
    systemPrompt: `You are a file analysis assistant. You help users understand and work with their documents, images, and other files.
When analyzing files:
- Summarize key points and structure
- Extract relevant information
- Suggest improvements or actions
- Help with file organization`,
    model: 'llama3.2:3b',
    temperature: 0.5,
    capabilities: ['chat', 'files', 'analysis'],
    tools: [{ name: 'file_search', enabled: true }],
    isActive: true,
    isDefault: false,
    sortOrder: 2,
  },
  {
    name: 'search',
    displayName: 'Search Agent',
    description: 'Performs semantic search across your knowledge base and documents',
    systemPrompt: `You are a research assistant with access to a knowledge base.
You help users find relevant information by:
- Understanding the context of their query
- Searching through available documents
- Synthesizing information from multiple sources
- Providing accurate citations and references`,
    model: 'llama3.2:3b',
    temperature: 0.4,
    capabilities: ['chat', 'search', 'rag'],
    tools: [{ name: 'qdrant_search', enabled: true }],
    isActive: true,
    isDefault: false,
    sortOrder: 3,
  },
  {
    name: 'workflow',
    displayName: 'Workflow Agent',
    description: 'Automates tasks using n8n workflows and integrations',
    systemPrompt: `You are an automation assistant that helps users trigger and manage workflows.
You can:
- Execute predefined workflows
- Help configure workflow parameters
- Monitor workflow status
- Suggest automation improvements`,
    model: 'llama3.2:3b',
    temperature: 0.5,
    capabilities: ['chat', 'workflows', 'automation'],
    tools: [{ name: 'workflow_trigger', enabled: true }],
    isActive: false, // Enable when n8n is deployed
    isDefault: false,
    sortOrder: 4,
  },
  {
    name: 'creative',
    displayName: 'Creative Agent',
    description: 'Assists with creative writing, brainstorming, and ideation',
    systemPrompt: `You are a creative writing assistant with expertise in storytelling, content creation, and brainstorming.
You help users:
- Generate creative content and ideas
- Improve writing style and tone
- Develop narratives and storylines
- Explore different perspectives`,
    model: 'llama3.2:3b',
    temperature: 0.9,
    maxTokens: 2000,
    capabilities: ['chat', 'creative', 'writing'],
    tools: [],
    isActive: true,
    isDefault: false,
    sortOrder: 5,
  },
];

const systemPromptTemplates = [
  {
    name: 'Professional Email',
    description: 'Helps write professional business emails',
    content: `Write a professional email about {{topic}}.
The tone should be {{tone}} and the recipient is {{recipient}}.
Key points to include: {{keyPoints}}`,
    variables: ['topic', 'tone', 'recipient', 'keyPoints'],
    category: 'business',
    tags: ['email', 'professional', 'communication'],
    isPublic: true,
  },
  {
    name: 'Code Review',
    description: 'Reviews code for quality, bugs, and improvements',
    content: `Please review the following {{language}} code:
\`\`\`{{language}}
{{code}}
\`\`\`

Focus on:
1. Code quality and readability
2. Potential bugs or issues
3. Performance considerations
4. Security vulnerabilities
5. Suggestions for improvement`,
    variables: ['language', 'code'],
    category: 'development',
    tags: ['code', 'review', 'quality'],
    isPublic: true,
  },
  {
    name: 'Document Summary',
    description: 'Summarizes documents with key points',
    content: `Please summarize the following document in {{length}} format:

{{document}}

Include:
- Main topic/purpose
- Key points (bulleted)
- Important details
- Actionable items (if any)`,
    variables: ['length', 'document'],
    category: 'productivity',
    tags: ['summary', 'document', 'analysis'],
    isPublic: true,
  },
  {
    name: 'Meeting Notes',
    description: 'Formats and structures meeting notes',
    content: `Please format these meeting notes:

{{rawNotes}}

Structure them with:
- Meeting title and date
- Attendees
- Agenda items discussed
- Key decisions made
- Action items with owners
- Next steps`,
    variables: ['rawNotes'],
    category: 'productivity',
    tags: ['meeting', 'notes', 'organization'],
    isPublic: true,
  },
];

async function main(): Promise<void> {
  console.log('🌱 Seeding database...');

  // Seed agents
  console.log('Creating agents...');
  for (const agent of defaultAgents) {
    await prisma.agent.upsert({
      where: { name: agent.name },
      update: {
        displayName: agent.displayName,
        description: agent.description,
        systemPrompt: agent.systemPrompt,
        model: agent.model,
        temperature: agent.temperature,
        maxTokens: agent.maxTokens,
        capabilities: agent.capabilities,
        tools: agent.tools,
        isActive: agent.isActive,
        isDefault: agent.isDefault,
        sortOrder: agent.sortOrder,
      },
      create: agent,
    });
    console.log(`  ✓ Agent: ${agent.displayName}`);
  }

  // Seed prompt templates (system-level, userId = null)
  console.log('Creating prompt templates...');
  for (const template of systemPromptTemplates) {
    const existing = await prisma.promptTemplate.findFirst({
      where: { name: template.name, userId: null },
    });

    if (!existing) {
      await prisma.promptTemplate.create({
        data: {
          ...template,
          userId: null, // System template
        },
      });
      console.log(`  ✓ Template: ${template.name}`);
    } else {
      console.log(`  ○ Template exists: ${template.name}`);
    }
  }

  console.log('✅ Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
