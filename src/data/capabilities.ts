export type CapabilityId =
  | 'operations'
  | 'product'
  | 'data'
  | 'ai'
  | 'cloud'
  | 'commerce';

export interface Capability {
  id: CapabilityId;
  index: string;
  shortLabel: string;
  title: string;
  summary: string;
  proof: string;
  systems: string[];
  technologies: string[];
}

export const capabilities: Capability[] = [
  {
    id: 'operations',
    index: 'C1',
    shortLabel: 'OPS',
    title: 'Operational systems',
    summary:
      'Workflows modeled on how the work actually happens: states, handoffs, capacity, exceptions, and the rollout that gets people using them.',
    proof: 'State and flow made explicit across production and lifecycle work.',
    systems: ['production-control', 'lifecycle-intelligence'],
    technologies: [
      'Process mapping',
      'State machines',
      'Capacity planning',
      'Exception design',
      'Rollout + training',
    ],
  },
  {
    id: 'product',
    index: 'C2',
    shortLabel: 'PRODUCT',
    title: 'Product + UX',
    summary:
      'Screens for people under pressure: review flows, clear ownership, and decision surfaces that stay legible on a busy floor.',
    proof: 'Complex production, lifecycle, and product setup paths shaped into usable control surfaces.',
    systems: ['production-control', 'lifecycle-intelligence', 'product-creation'],
    technologies: [
      'Information architecture',
      'Interaction design',
      'Review workflows',
      'Role + authority design',
      'Operational visualization',
      'Full-stack React + TypeScript',
    ],
  },
  {
    id: 'data',
    index: 'C3',
    shortLabel: 'DATA',
    title: 'Data + intelligence',
    summary:
      'Pipelines, forecasts, and read models built for decisions, with freshness and uncertainty kept in view.',
    proof: 'Heavy computation moved off the read path; uncertainty and freshness stay visible.',
    systems: ['production-control', 'lifecycle-intelligence', 'stockout-intelligence'],
    technologies: [
      'PostgreSQL + SQL',
      'BigQuery',
      'Python + Pandas',
      'ETL / ELT',
      'Forecasting',
      'Cache + read models',
    ],
  },
  {
    id: 'ai',
    index: 'C4',
    shortLabel: 'AI',
    title: 'AI + automation',
    summary:
      'Rules plus models where they help, human approval where it matters, and one source of truth throughout.',
    proof: 'Multimodal interpretation accelerates setup while consequential writes stay reviewable.',
    systems: ['product-creation', 'production-control'],
    technologies: [
      'Multimodal vision models',
      'Document + image extraction',
      'Deterministic rules',
      'Human-in-the-loop gates',
      'Codex + Claude workflows',
      'OpenClaw orchestration',
    ],
  },
  {
    id: 'cloud',
    index: 'C5',
    shortLabel: 'CLOUD',
    title: 'Cloud + reliability',
    summary:
      'Thin apps on top of scheduled and on-demand compute, scoped access, monitored jobs, and failure paths that recover.',
    proof: 'Background work, analytical compute, and the read path are separated and monitored.',
    systems: [
      'production-control',
      'lifecycle-intelligence',
      'product-creation',
      'stockout-intelligence',
    ],
    technologies: [
      'Cloud Run jobs + services',
      'Cloud Scheduler',
      'BigQuery + Cloud Storage',
      'Queues + retries',
      'IAM + Secret Manager',
      'Health + monitoring',
      'Migrations + rollback',
      'Playwright + pytest',
    ],
  },
  {
    id: 'commerce',
    index: 'C6',
    shortLabel: 'COMMERCE',
    title: 'Commerce + integrations',
    summary:
      'Store, inventory, workspace, messaging, and reporting systems connected into one controlled workflow.',
    proof: 'Commerce APIs and workplace tools become parts of one controlled workflow.',
    systems: [
      'production-control',
      'lifecycle-intelligence',
      'product-creation',
      'stockout-intelligence',
    ],
    technologies: [
      'Shopify GraphQL + REST',
      'Google Workspace',
      'Slack',
      'Webhooks + APIs',
      'OAuth',
      'Operational reporting',
    ],
  },
];
