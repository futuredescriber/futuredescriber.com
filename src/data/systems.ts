export type SystemSchematic =
  | 'production'
  | 'lifecycle'
  | 'product-creation'
  | 'stockout';
export type SystemChapterGrammar =
  | 'route'
  | 'orbit'
  | 'approval-gate'
  | 'priority-queue';


export interface PortfolioSystem {
  id: string;
  number: string;
  codename: string;
  title: string;
  context: string;
  problem: string;
  system: string;
  result: string;
  features: string[];
  capabilities: string[];
  roles: string[];
  schematic: SystemSchematic;
  chapterGrammar: SystemChapterGrammar;
  visibility: 'featured';
  disclosure: 'details-generalized';
  metrics: Array<{ label: string; value: string; sourceNote: string }>;
}

export const systems: PortfolioSystem[] = [
  {
    id: 'production-control',
    number: '01',
    codename: 'FLOORLINE',
    title: 'Production Control Layer',
    context: 'The daily operating system for a production floor.',
    problem:
      'Jobs, due dates, and status lived in separate tools and in people’s heads, so every handoff needed a conversation.',
    system:
      'One place to plan the queue against capacity, see the state of every job, flag exceptions to the right people, and refresh the numbers each morning on their own.',
    result:
      'Coordination moved from conversations to a shared board. Managers plan from the same view the floor works from.',
    features: [
      'Workflow planning and coordination',
      'Execution and exception visibility',
      'Reporting and business-system integrations',
    ],
    capabilities: ['operations', 'product', 'data', 'ai', 'cloud', 'commerce'],
    roles: ['Problem framing', 'Workflow and product design', 'Architecture', 'Implementation', 'Testing and rollout'],
    schematic: 'production',
    chapterGrammar: 'route',
    visibility: 'featured',
    disclosure: 'details-generalized',
    metrics: [],
  },
  {
    id: 'lifecycle-intelligence',
    number: '02',
    codename: 'LIFECYCLE',
    title: 'Product Lifecycle Intelligence',
    context: 'Decision support for a large ecommerce catalogue.',
    problem:
      'Deciding what to keep, discount, or retire meant pulling sales, inventory, and margin out of several systems by hand, and the answer changed with who did the pulling.',
    system:
      'A review layer that scores every product on velocity, sell-through, and stock, runs the heavy analytics in the background, and routes decisions through structured approvals.',
    result:
      'Reviews happen on a schedule with the same evidence every time, and the app stays fast because the analysis never runs on the page.',
    features: [
      'Lifecycle review workflows',
      'Sales and inventory decision support',
      'Reliable analytical pipelines',
    ],
    capabilities: ['operations', 'product', 'data', 'cloud', 'commerce'],
    roles: ['Decision model', 'Workflow and UX', 'Data architecture', 'Cloud implementation', 'Production hardening'],
    schematic: 'lifecycle',
    chapterGrammar: 'orbit',
    visibility: 'featured',
    disclosure: 'details-generalized',
    metrics: [],
  },
  {
    id: 'product-creation',
    number: '03',
    codename: 'HUMAN GATE',
    title: 'AI-Assisted Product Creation',
    context: 'Human-in-the-loop setup for new ecommerce products.',
    problem:
      'Every new product meant reading mockups and spec sheets, then typing the same details into the store, variant by variant.',
    system:
      'Vision models and deterministic rules read the inputs and produce complete, validated product records. A person reviews each one before anything reaches the store.',
    result:
      'Setup turned from a chore into a review. People spend their time on the judgment calls, and nothing publishes without approval.',
    features: [
      'Document and image interpretation',
      'Structured product-data generation',
      'Human approval before external changes',
    ],
    capabilities: ['product', 'ai', 'cloud', 'commerce'],
    roles: ['Workflow model', 'Product and UX', 'AI and rules design', 'API architecture', 'Acceptance and verification'],
    schematic: 'product-creation',
    chapterGrammar: 'approval-gate',
    visibility: 'featured',
    disclosure: 'details-generalized',
    metrics: [],
  },
  {
    id: 'stockout-intelligence',
    number: '04',
    codename: 'RISK FIELD',
    title: 'Inventory Risk Intelligence',
    context: 'Which empty shelves actually cost money.',
    problem:
      'A stock report lists every variant at zero without saying which ones matter.',
    system:
      'A daily model estimates the sales lost to each stockout from that variant’s own history, then ranks the gaps into an auditable queue.',
    result:
      'The restock conversation starts with the biggest losses instead of the longest list.',
    features: [
      'Commerce-data ingestion',
      'Context-aware forecasting',
      'Prioritized reporting and auditability',
    ],
    capabilities: ['operations', 'product', 'data', 'cloud', 'commerce'],
    roles: ['Business logic', 'Forecasting model', 'Data architecture', 'Decision UX', 'Reliability and boundaries'],
    schematic: 'stockout',
    chapterGrammar: 'priority-queue',
    visibility: 'featured',
    disclosure: 'details-generalized',
    metrics: [],
  },
];
